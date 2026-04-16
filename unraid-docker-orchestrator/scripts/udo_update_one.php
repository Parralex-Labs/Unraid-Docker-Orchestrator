#!/usr/bin/php -q
<?php
/**
 * UDO - Mise à jour d'un container Docker sans nchan
 * Usage: php udo_update_one.php <container_name>
 * Exit 0 = succès, Exit 1 = erreur
 */

$docroot = $docroot ?? ($_SERVER['DOCUMENT_ROOT'] ?: '/usr/local/emhttp');
require_once "$docroot/plugins/dynamix.docker.manager/include/DockerClient.php";

$name = $argv[1] ?? '';
if (!$name) { fwrite(STDERR, "Usage: udo_update_one.php <name>\n"); exit(1); }

$DockerClient    = new DockerClient();
$DockerTemplates = new DockerTemplates();
$DockerUpdate    = new DockerUpdate();

// Lire les labels Unraid du container AVANT toute modification
// Ils seront réinjectés dans la commande docker run si xmlToCommand() ne les pose pas
// Source de vérité : docker inspect (reflète ce qu'Unraid a posé à la création)
function readUnraidLabels(string $containerName): array {
    $fmt  = '{{json .Config.Labels}}';
    $json = shell_exec("docker inspect --format=" . escapeshellarg($fmt) . " " . escapeshellarg($containerName) . " 2>/dev/null") ?? '{}';
    $all  = json_decode(trim($json), true) ?: [];
    $keep = [];
    // Labels critiques pour que le panneau Docker Unraid reconnaisse le container
    $unraidKeys = [
        'net.unraid.docker.managed',
        'net.unraid.docker.webui',
        'net.unraid.docker.icon',
        'net.unraid.docker.shell',
        'net.unraid.docker.overview',
    ];
    foreach ($unraidKeys as $k) {
        if (isset($all[$k]) && $all[$k] !== '') {
            $keep[$k] = $all[$k];
        }
    }
    return $keep;
}

// Injecter les labels Unraid dans une commande docker run si absents
function injectUnraidLabels(string $cmd, array $labels): string {
    if (empty($labels)) return $cmd;
    $parts = [];
    foreach ($labels as $k => $v) {
        // Vérifier si le label est déjà présent dans la commande
        if (strpos($cmd, $k) === false) {
            $parts[] = '-l ' . escapeshellarg("$k=$v");
        }
    }
    if (empty($parts)) return $cmd;
    // Insérer les labels juste avant le nom de l'image (dernier argument)
    // Format : ... [options] image [command]
    // On insère avant le dernier token non-option
    $labelsStr = implode(' ', $parts);
    // Stratégie : insérer avant le dernier argument (l'image)
    $lastSpace = strrpos(rtrim($cmd), ' ');
    if ($lastSpace !== false) {
        $cmd = substr($cmd, 0, $lastSpace) . ' ' . $labelsStr . substr($cmd, $lastSpace);
    }
    return $cmd;
}

$unraidLabels = readUnraidLabels($name);
if (!empty($unraidLabels)) {
    echo "Labels Unraid lus: " . implode(', ', array_keys($unraidLabels)) . "\n";
} else {
    echo "WARN: aucun label Unraid trouvé sur $name — le container pourrait apparaître en 3rd party\n";
}

// 1. Trouver le template XML
$tmpl = $DockerTemplates->getUserTemplate($name);
if (!$tmpl) {
    // Fallback : pas de template XML → recréer depuis docker inspect
    // Récupérer l'image depuis docker inspect
    $Repository = trim(shell_exec("docker inspect --format='{{.Config.Image}}' " . escapeshellarg($name) . " 2>/dev/null") ?? '');
    if (!$Repository) {
        fwrite(STDERR, "ERREUR: template XML et image introuvables pour $name\n");
        exit(1);
    }
    echo "WARN: template XML absent pour $name — recréation depuis docker inspect\n";
    // Sans template XML : docker start conserve les labels existants
    // Les labels Unraid sont préservés car le container n'est pas recréé
    // On se limite à pull + restart pour ne pas perdre la configuration
    $wasRunning = !empty(($DockerClient->getContainerDetails($name))['State']['Running']);
    if ($wasRunning) {
        echo "Stop: $name\n";
        $DockerClient->stopContainer($name);
    }
    echo "Start: $name (nouvelle image)\n";
    shell_exec("docker start " . escapeshellarg($name) . " 2>&1");
    $DockerClient->flushCaches();
    // Nettoyage image ancienne
    $oldImageIDFb = $oldImageID;
    $newImageIDFb = trim(shell_exec("docker inspect --format='{{.Image}}' " . escapeshellarg($name) . " 2>/dev/null") ?? '');
    if ($oldImageIDFb && $newImageIDFb && $oldImageIDFb !== $newImageIDFb) {
        echo "Remove old image: " . substr($oldImageIDFb, 0, 12) . "\n";
        echo shell_exec("docker rmi " . escapeshellarg($oldImageIDFb) . " 2>&1") ?? '';
    }
    echo "OK: $name (fallback inspect)\n";
    exit(0);
}

// 2. Construire la commande docker run depuis le XML
// xmlToCommand() peut lever une exception en PHP 8 si le champ Network
// est 'bridge' et que la liste des réseaux Docker n'est pas disponible
// en contexte CLI (key_exists('bridge', null) → TypeError)
// Charger le XML une fois pour tous les fallbacks
$xml = simplexml_load_file($tmpl);
$cmd = null; $Name = $name; $Repository = '';
try {
    [$cmd, $Name, $Repository] = xmlToCommand($tmpl);
} catch (Throwable $e) {
    // Fallback : récupérer Repository depuis le XML directement
    $Repository = (string)($xml->Repository ?? '');
    echo "WARN: xmlToCommand exception (" . $e->getMessage() . ") — fallback docker inspect\n";
}
// Injecter les labels Unraid si xmlToCommand() ne les a pas posés
if ($cmd) {
    $cmd = injectUnraidLabels($cmd, $unraidLabels);
}

// Si xmlToCommand a échoué ou retourné une commande vide, reconstruire depuis docker inspect
if (!$cmd && $Repository) {
    // Reconstruire une commande docker run minimale depuis docker inspect
    // Unraid recréera le container proprement via DockerMan après le redémarrage
    $inspect_json = shell_exec("docker inspect " . escapeshellarg($name) . " 2>/dev/null");
    $inspect = json_decode($inspect_json, true);
    $container = $inspect[0] ?? null;
    if ($container) {
        // Chemin docker : lire depuis le PATH système, pas hardcodé
        $docker_bin = trim(shell_exec('which docker 2>/dev/null') ?? '/usr/bin/docker');
        $img = $Repository;

        // Réseau : lu depuis le XML (source de vérité Unraid), sans valeur par défaut imposée
        $net_xml = trim((string)($xml->Network ?? ''));
        $cmd_parts = ["$docker_bin run -d"];
        $cmd_parts[] = "--name=" . escapeshellarg($name);
        if ($net_xml !== '') {
            $cmd_parts[] = "--network=" . escapeshellarg($net_xml);
        }

        // Ports : depuis HostConfig.PortBindings (valeurs réelles du container)
        foreach (($container['HostConfig']['PortBindings'] ?? []) as $cport => $bindings) {
            foreach (($bindings ?? []) as $b) {
                $hp = $b['HostPort'] ?? '';
                $parts = explode('/', $cport, 2);
                $port  = $parts[0];
                $proto = $parts[1] ?? 'tcp';
                if ($hp !== '') $cmd_parts[] = "-p $hp:$port/$proto";
            }
        }

        // Volumes : uniquement les bind mounts (pas les named volumes Docker internes)
        foreach (($container['Mounts'] ?? []) as $m) {
            if ($m['Type'] === 'bind') {
                $mode = ($m['RW'] ?? true) ? 'rw' : 'ro';
                $cmd_parts[] = "-v " . escapeshellarg($m['Source']) . ":" . escapeshellarg($m['Destination']) . ":$mode";
            }
        }

        // Variables d'environnement : comparer avec l'image de base pour ne garder
        // que les variables ajoutées/modifiées par l'utilisateur dans le template
        $img_env_raw = shell_exec("docker image inspect --format='{{range .Config.Env}}{{.}}|{{end}}' " . escapeshellarg($img) . " 2>/dev/null") ?? '';
        $img_env = array_filter(explode('|', $img_env_raw));
        $img_env_keys = array_map(fn($e) => explode('=', $e, 2)[0], $img_env);

        // Variables définies dans le XML du template (source de vérité utilisateur)
        $xml_env_keys = [];
        foreach (($xml->Config ?? []) as $cfg) {
            if ((string)$cfg['Type'] === 'Variable' && (string)$cfg['Target'] !== '') {
                $xml_env_keys[] = (string)$cfg['Target'];
            }
        }

        foreach (($container['Config']['Env'] ?? []) as $env) {
            $ekey = explode('=', $env, 2)[0];
            // Inclure si : défini dans le template XML OU non présent dans l'image de base
            if (in_array($ekey, $xml_env_keys) || !in_array($ekey, $img_env_keys)) {
                $cmd_parts[] = '-e ' . escapeshellarg($env);
            }
        }

        // Privileged
        if (!empty($container['HostConfig']['Privileged'])) {
            $cmd_parts[] = '--privileged';
        }

        // Devices (ex: /dev/net/tun pour gluetun, /dev/dri pour GPU)
        foreach (($container['HostConfig']['Devices'] ?? []) as $dev) {
            $path_host      = $dev['PathOnHost']      ?? '';
            $path_container = $dev['PathInContainer'] ?? $path_host;
            $perms          = $dev['CgroupPermissions'] ?? 'rwm';
            if ($path_host !== '') {
                $cmd_parts[] = "--device=$path_host:$path_container:$perms";
            }
        }

        // Capabilities (ex: NET_ADMIN pour gluetun)
        foreach (($container['HostConfig']['CapAdd'] ?? []) as $cap) {
            $cmd_parts[] = "--cap-add=" . escapeshellarg($cap);
        }

        // Sysctls (ex: net.ipv4.conf.all.src_valid_mark=1 pour wireguard)
        foreach (($container['HostConfig']['Sysctls'] ?? []) as $k => $v) {
            $cmd_parts[] = "--sysctl=" . escapeshellarg("$k=$v");
        }

        // Restart policy : lue depuis docker inspect (pas de valeur par défaut imposée)
        $restart = $container['HostConfig']['RestartPolicy']['Name'] ?? '';
        if ($restart !== '' && $restart !== 'no') {
            $max = $container['HostConfig']['RestartPolicy']['MaximumRetryCount'] ?? 0;
            $restart_str = ($restart === 'on-failure' && $max > 0) ? "on-failure:$max" : $restart;
            $cmd_parts[] = "--restart=" . escapeshellarg($restart_str);
        }

        // ExtraParams du XML Unraid — contient les flags que docker inspect ne préserve pas
        // (ex: --cap-add=NET_ADMIN --device /dev/net/tun:/dev/net/tun pour gluetun)
        // On ajoute ExtraParams tel quel, c'est la source de vérité Unraid pour ces options
        $extraParams = trim((string)($xml->ExtraParams ?? ''));
        if ($extraParams !== '') {
            $cmd_parts[] = $extraParams;
        }

        // Image
        $cmd_parts[] = escapeshellarg($img);
        $cmd = implode(" ", $cmd_parts);
        // Réinjecter les labels Unraid (absents du fallback reconstruit)
        $cmd = injectUnraidLabels($cmd, $unraidLabels);
        echo "Commande reconstruite depuis docker inspect (fallback xmlToCommand)\n";
    }
}

if (!$cmd) {
    fwrite(STDERR, "ERREUR: impossible de construire la commande docker run pour $name\n");
    exit(1);
}

// 3. Sauvegarder l'ID de l'ancienne image via docker inspect (pas docker.json)
// {{.Image}} retourne l'ID de l'image utilisée par le container
$oldImageID = trim(shell_exec("docker inspect --format='{{.Image}}' " . escapeshellarg($name) . " 2>/dev/null") ?? '');

// 4. Vérifier si le container tourne
$details = $DockerClient->getContainerDetails($name);
$wasRunning = !empty($details['State']['Running']);

// ROLLBACK — Tag l'ancienne image avant toute modification
// Format : udo_rollback/<name>:latest
// Supprimé après succès, utilisé pour restaurer en cas d'échec
$rollbackTag = 'udo_rollback/' . preg_replace('/[^a-z0-9_.-]/', '_', strtolower($name)) . ':latest';
$hasRollback = false;
if ($oldImageID) {
    $tagRet = null;
    system("docker tag " . escapeshellarg($oldImageID) . " " . escapeshellarg($rollbackTag) . " 2>&1", $tagRet);
    if ($tagRet === 0) {
        $hasRollback = true;
        echo "Rollback tag créé: $rollbackTag\n";
    } else {
        echo "WARN: impossible de créer le tag rollback pour $name\n";
    }
}

// 5. Stop si running
if ($wasRunning) {
    echo "Stop: $name\n";
    $ret = $DockerClient->stopContainer($name);
    if ($ret !== true) fwrite(STDERR, "WARN stop: $ret\n");
}

// 6. Supprimer l'ancien container
echo "Remove: $name\n";
$ret = $DockerClient->removeContainer($name);
if ($ret !== true) {
    // Nettoyer le tag rollback si remove échoue (container toujours là)
    if ($hasRollback) shell_exec("docker rmi " . escapeshellarg($rollbackTag) . " 2>/dev/null");
    fwrite(STDERR, "ERREUR remove: $ret\n");
    exit(1);
}

// 7. Recréer depuis le XML (run si était running, create sinon)
if ($wasRunning) {
    $cmd = str_replace('/docker create ', '/docker run -d ', $cmd);
}
echo "Create: $name\n";
// execCommand() utilise nchan — on exécute directement via system()
system($cmd . " 2>&1", $ret);
if ($ret !== 0) {
    fwrite(STDERR, "ERREUR create: code $ret\n");
    // ROLLBACK — Tentative de restauration avec l'ancienne image
    if ($hasRollback) {
        echo "ROLLBACK: tentative de restauration depuis $rollbackTag\n";
        $rollbackCmd = str_replace(escapeshellarg($Repository), escapeshellarg($rollbackTag), $cmd);
        system($rollbackCmd . " 2>&1", $rbRet);
        if ($rbRet === 0) {
            echo "ROLLBACK OK: $name restauré depuis l'ancienne image\n";
        } else {
            fwrite(STDERR, "ROLLBACK ECHEC: impossible de restaurer $name (code $rbRet)\n");
        }
        // Conserver le tag rollback si le rollback a réussi (utile pour diagnostic)
        // Il sera nettoyé lors de la prochaine mise à jour réussie
    }
    exit(1);
}

// Succès : supprimer le tag rollback (l'ancienne image sera nettoyée à l'étape 10)
if ($hasRollback) {
    shell_exec("docker rmi " . escapeshellarg($rollbackTag) . " 2>/dev/null");
    echo "Rollback tag supprimé\n";
}

// 8. Ajouter route WireGuard si applicable
addRoute($name);

// 9. Flush caches Dynamix (met à jour docker.json)
$DockerClient->flushCaches();

// 10. Supprimer l'ancienne image et toutes les images obsolètes du même repo
// Stratégie : supprimer par repo:tag (plus fiable que par ID)
// Couvre les 3 cas :
//   - Image mise à jour : ancienne image devenue dangling ou avec tag obsolète
//   - Image "à jour" mais pullée : même digest, mais Docker peut créer des layers résiduels
//   - Image avec plusieurs tags : docker rmi par ID échoue si le tag existe encore
$newImageID = trim(shell_exec("docker image inspect --format='{{.Id}}' " . escapeshellarg($Repository) . " 2>/dev/null") ?? '');

// Lister toutes les images du même repo (par tag) sauf la version courante
$allImages = shell_exec("docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' 2>/dev/null") ?? '';
$repoBase = preg_replace('/:.*$/', '', $Repository);

// IDs d'images actuellement utilisées par des containers running
// → ne jamais tenter de supprimer une image active
$usedIDs = [];
$usedRaw = shell_exec("docker ps --format '{{.Image}}' 2>/dev/null") ?? '';
foreach (array_filter(explode("\n", trim($usedRaw))) as $runningImg) {
    $usedID = trim(shell_exec("docker image inspect --format='{{.Id}}' " . escapeshellarg($runningImg) . " 2>/dev/null | cut -c8-19") ?? '');
    if ($usedID) $usedIDs[$usedID] = true;
}

foreach (array_filter(explode("\n", trim($allImages))) as $line) {
    $parts = explode(' ', trim($line), 2);
    if (count($parts) < 2) continue;
    [$imgRef, $imgId] = $parts;
    // Ne supprimer que les images du même repo
    $imgRepoBase = preg_replace('/:.*$/', '', $imgRef);
    if ($imgRepoBase !== $repoBase) continue;
    // Ne pas supprimer l'image actuellement utilisée par le nouveau container
    if ($newImageID && strpos($newImageID, $imgId) === 0) continue;
    // Ne pas supprimer une image utilisée par un container running
    if (isset($usedIDs[$imgId])) { echo "Skip (in use): $imgRef ($imgId)\n"; continue; }
    // Ne pas tenter docker rmi avec tag <none> → utiliser l'ID directement
    if (strpos($imgRef, ':<none>') !== false) continue; // traité dans le bloc dangling ci-dessous
    if ($oldImageID && $imgId === substr($oldImageID, 0, 12)) {
        echo "Remove old image: $imgRef ($imgId)\n";
    } else {
        echo "Remove obsolete image: $imgRef ($imgId)\n";
    }
    echo shell_exec("docker rmi " . escapeshellarg($imgRef) . " 2>&1") ?? '';
}

// Nettoyer les dangling (sans tag) du même repo par ID
$dangling = shell_exec("docker images --filter dangling=true --format '{{.ID}} {{.Repository}}' 2>/dev/null") ?? '';
foreach (array_filter(explode("\n", trim($dangling))) as $line) {
    $parts = explode(' ', trim($line), 2);
    if (count($parts) < 2) continue;
    [$imgId, $imgRepo] = $parts;
    if (trim($imgRepo) !== $repoBase) continue;
    if ($newImageID && strpos($newImageID, $imgId) === 0) continue;
    if (isset($usedIDs[$imgId])) { echo "Skip dangling (in use): $imgId\n"; continue; }
    echo "Remove dangling: $imgId\n";
    echo shell_exec("docker rmi " . escapeshellarg($imgId) . " 2>&1") ?? '';
}

// 11. Mettre à jour unraid-update-status.json via docker inspect
$statusFile = '/var/lib/docker/unraid-update-status.json';
if (file_exists($statusFile)) {
    $inspect = shell_exec("docker inspect --format='{{index .RepoDigests 0}}' " . escapeshellarg($Repository) . " 2>/dev/null");
    $digest = trim($inspect ?? '');
    // Extraire sha256:... depuis image@sha256:...
    if (preg_match('/(sha256:[a-f0-9]+)/', $digest, $m)) {
        $digest = $m[1];
        $status = json_decode(file_get_contents($statusFile), true) ?: [];
        $status[$Repository] = ['local' => $digest, 'remote' => $digest, 'status' => 'true'];
        file_put_contents($statusFile, json_encode($status, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES));
        echo "Status updated: $Repository\n";
    }
}

echo "OK: $name\n";
exit(0);
