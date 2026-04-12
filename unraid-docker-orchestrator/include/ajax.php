<?php
/**
 * Unraid Docker Orchestrator
 * Copyright (C) 2026 Parralex-Labs
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * Source: https://github.com/Parralex-Labs/Unraid-Docker-Orchestrator
 */

// ── Initialisation Unraid ────────────────────────────────────────────────────
$docroot = $docroot ?? $_SERVER['DOCUMENT_ROOT'] ?: '/usr/local/emhttp';
require_once "{$docroot}/webGui/include/Wrappers.php";

define('DOCKER_BIN',  '/usr/bin/docker');
define('CACHE_FILE',  '/tmp/udo_inspect_cache.json');
define('CACHE_TTL',   10);
define('CONFIG_DIR',  '/boot/config/plugins/unraid-docker-orchestrator');
define('CONFIG_FILE', CONFIG_DIR . '/config.json');
define('TPL_DIR',     '/boot/config/plugins/dockerMan/templates-user');

// ── Router ───────────────────────────────────────────────────────────────────
// Unraid Wrappers.php peut utiliser ob_start() → vider le buffer avant de répondre
@ob_end_clean();
header('Content-Type: application/json; charset=utf-8');
$action = $_POST['action'] ?? $_GET['action'] ?? '';

// Lire $data: JSON body → champ 'data' JSON-encodé → champs $_POST directs
$contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
if (str_contains($contentType, 'application/json')) {
  // Requête JSON directe
  $raw  = file_get_contents('php://input');
  $data = $raw ? (json_decode($raw, true) ?: []) : [];
} elseif (isset($_POST['data']) && $_POST['data']) {
  // Format standard: données dans le champ 'data' JSON-encodé
  $data = json_decode($_POST['data'], true) ?: [];
} else {
  // Champs $_POST individuels (udoFetch avec body = {key:val, ...})
  $data = array_diff_key($_POST, ['csrf_token' => 1, 'action' => 1]);
}

switch ($action) {
  case 'import_docker':   echo json_encode(importAllSources());     break;
  case 'read_templates':  echo json_encode(readUnraidTemplates());  break;
  case 'container_status':echo json_encode(containerStatus());      break;
  case 'check_drift':     echo json_encode(checkDrift());           break;
  case 'check_scripts':   echo json_encode(checkScriptsFresh());     break;
  case 'save_config':     echo json_encode(saveConfig($data));      break;
  case 'load_config':     echo json_encode(loadConfig());           break;
  case 'install_script':  echo json_encode(installScript($data));   break;
  case 'run_script':      echo json_encode(runScript($data));       break;
  case 'save_cron':       echo json_encode(saveCron($data));        break;
  case 'get_schedules':   echo json_encode(getSchedules());         break;
  // ── Couche communautaire (stubs — feature non activée) ──────────────────
  case 'fetch_community_presets': echo json_encode(['success' => true, 'stub' => true]); break;
  case 'submit_vote':             echo json_encode(['success' => true, 'stub' => true]); break;
  case 'update_schedule': echo json_encode(updateSchedule($data));  break;
  case 'read_log':        
  case 'get_log':          echo json_encode(readLog());              break;
  case 'clear_log':        echo json_encode(clearLog());             break;
  case 'export_config':   echo json_encode(loadConfig());           break;
  case 'import_config':   echo json_encode(saveConfig($data));      break;
  case 'clear_cache':     @unlink(CACHE_FILE); echo json_encode(['success'=>true]); break;
  case 'disable_autostart': echo json_encode(disableUnraidAutostart()); break;
  case 'debug_autostart':   echo json_encode(debugAutostart());          break;
  case 'disable_autostart': echo json_encode(disableUnraidAutostart()); break;
  case 'debug_autostart':   echo json_encode(debugAutostart());          break;
  default:                echo json_encode(['success'=>false,'error'=>"Action inconnue: {$action}"]);
}
exit;

// ════════════════════════════════════════════════════════════════════════════
// COLLECTE UNIFIÉE — 3 SOURCES
// ════════════════════════════════════════════════════════════════════════════

function importAllSources(): array {
  // Cache court (10s) pour éviter les appels répétés
  if (file_exists(CACHE_FILE) && (time() - filemtime(CACHE_FILE)) < CACHE_TTL) {
    $cached = json_decode(file_get_contents(CACHE_FILE), true);
    if ($cached && isset($cached['containers']) && isset($cached['_version']) && $cached['_version'] === 3) {
      $cached['fromCache'] = true;
      return $cached;
    }
    @unlink(CACHE_FILE);
  }

  // ── SOURCE 1: docker inspect (état + runtime) ─────────────────────────────
  $inspectData = fetchDockerInspect();
  if (!$inspectData['success']) return $inspectData;

  // ── SOURCE 2: XML Templates Unraid ────────────────────────────────────────
  $xmlData = parseAllXmlTemplates();

  // ── SOURCE 3: YAML Compose ───────────────────────────────────────────────
  $yamlData = parseAllComposeYaml($inspectData['raw']);

  // ── FUSION ───────────────────────────────────────────────────────────────
  $containers = fuseAllSources($inspectData['raw'], $xmlData, $yamlData);

  // ── Réseaux Docker ───────────────────────────────────────────────────────
  $networks = fetchDockerNetworks();

  $result = [
    'success'    => true,
    'containers' => $containers,
    'networks'   => $networks,
    'message'    => count($containers) . ' conteneurs importés',
    'stats'      => [
      'total'        => count($containers),
      'with_xml'     => count(array_filter($containers, fn($c) => $c['unraid']['has_template'])),
      'with_yaml'    => count(array_filter($containers, fn($c) => !empty($c['compose']['yaml_path']))),
      'inspect_only' => count(array_filter($containers, fn($c) => !$c['unraid']['has_template'] && empty($c['compose']['yaml_path']))),
    ],
    '_version'   => 3,
    '_generated' => date('c'),
  ];

  file_put_contents(CACHE_FILE, json_encode($result));
  return $result;
}

// ════════════════════════════════════════════════════════════════════════════
// SOURCE 1 — DOCKER INSPECT
// ════════════════════════════════════════════════════════════════════════════

function fetchDockerInspect(): array {
  $output = runCmd(DOCKER_BIN . ' ps -a --format "{{.Names}}"', 15);
  if (empty(trim($output))) return ['success' => false, 'error' => 'Aucun conteneur trouvé'];

  $names = array_filter(array_map('trim', explode("\n", trim($output))));
  if (empty($names)) return ['success' => false, 'error' => 'Liste vide'];

  $namesList   = implode(' ', array_map('escapeshellarg', $names));
  $inspectJson = runCmd(DOCKER_BIN . " inspect {$namesList}", 30);
  if (empty($inspectJson)) return ['success' => false, 'error' => 'docker inspect échoué'];

  $raw = json_decode($inspectJson, true);
  if (!is_array($raw)) return ['success' => false, 'error' => 'JSON inspect invalide'];

  return ['success' => true, 'raw' => $raw];
}

function fetchDockerNetworks(): array {
  $netIds = trim(runCmd(DOCKER_BIN . ' network ls -q', 10));
  if (empty($netIds)) return [];
  $netList = implode(' ', array_map('trim', explode("\n", $netIds)));
  $netJson = runCmd(DOCKER_BIN . " network inspect {$netList}", 20);
  return json_decode($netJson, true) ?: [];
}

// ════════════════════════════════════════════════════════════════════════════
// SOURCE 2 — XML TEMPLATES UNRAID
// ════════════════════════════════════════════════════════════════════════════

function parseAllXmlTemplates(): array {
  $byName  = [];
  $byImage = [];
  if (!is_dir(TPL_DIR)) return ['byName' => [], 'byImage' => []];

  foreach (glob(TPL_DIR . '/my-*.xml') as $f) {
    $xml = @simplexml_load_file($f);
    if (!$xml) continue;

    $name = trim((string)($xml->Name ?? ''));
    if (!$name) $name = preg_replace('/^my-(.+)\.xml$/', '$1', basename($f));

    $tpl = parseXmlTemplate($xml, $f);
    $tpl['name'] = $name;

    $byName[$name] = $tpl;
    if (!empty($tpl['image'])) {
      $imgBase = strtolower(preg_replace('/:.*$/', '', $tpl['image']));
      $byImage[$imgBase] = $tpl;
    }
  }

  return ['byName' => $byName, 'byImage' => $byImage];
}

function parseXmlTemplate(\SimpleXMLElement $xml, string $file): array {
  // ── Infos générales ───────────────────────────────────────────────────────
  $image       = trim((string)($xml->Repository       ?? ''));
  $network     = trim((string)($xml->Network          ?? 'bridge'));
  $webui       = trim((string)($xml->WebUI            ?? ''));
  $icon        = trim((string)($xml->Icon             ?? ''));
  $category    = trim((string)($xml->Category         ?? ''));
  $description = trim((string)($xml->Overview         ?? (string)($xml->Description ?? '')));
  $privileged  = strtolower(trim((string)($xml->Privileged  ?? 'false'))) === 'true';
  $extraParams = trim((string)($xml->ExtraParams       ?? ''));
  $shell       = trim((string)($xml->Shell            ?? 'sh'));
  $webAddress  = trim((string)($xml->WebAddress       ?? ''));
  $volsFrom    = trim((string)($xml->VolumesFrom      ?? ''));
  $support     = trim((string)($xml->Support          ?? ''));
  $project     = trim((string)($xml->Project          ?? ''));
  $memLimit    = trim((string)($xml->MemLimit         ?? ''));
  $cpuSet      = trim((string)($xml->CPUset           ?? ''));

  // ── Extraire port WebUI pour healthcheck auto ─────────────────────────────
  $webuiPort = null;
  $webuiPath = '/';
  if ($webui) {
    if (preg_match('/:\[PORT:(\d+)\]([^\s"]*)/i', $webui, $m)) {
      $webuiPort = (int)$m[1];
      $webuiPath = $m[2] ?: '/';
    } elseif (preg_match('/:(\d{2,5})([^\s"]*)/i', $webui, $m)) {
      $webuiPort = (int)$m[1];
      $webuiPath = $m[2] ?: '/';
    }
  }

  // ── Analyse ExtraParams ───────────────────────────────────────────────────
  $gpuNvidia   = (bool)preg_match('/--runtime[= ]nvidia|--gpus/i', $extraParams);
  $gpuIntel    = false; // détecté via devices
  $capAdd      = [];
  $capDrop     = [];
  $sysctl      = [];
  $extraLabels = [];
  if (preg_match_all('/--cap-add[= ]([^\s]+)/i', $extraParams, $m)) $capAdd  = array_merge($capAdd,  $m[1]);
  if (preg_match_all('/--cap-drop[= ]([^\s]+)/i', $extraParams, $m)) $capDrop = array_merge($capDrop, $m[1]);
  if (preg_match_all('/--sysctl[= ]([^\s]+)/i',   $extraParams, $m)) {
    foreach ($m[1] as $s) {
      [$k, $v] = array_pad(explode('=', $s, 2), 2, '');
      $sysctl[$k] = $v;
    }
  }
  if (preg_match_all('/--label[= ]([^\s]+)/i', $extraParams, $m)) $extraLabels = $m[1];

  // Détection VPN via cap-add
  $isVpn = in_array('NET_ADMIN', array_map('strtoupper', $capAdd))
        || stripos($extraParams, 'NET_ADMIN') !== false;

  // ── Configs (ports, volumes, variables, devices, labels) ──────────────────
  $ports   = [];
  $volumes = [];
  $envVars = [];
  $devices = [];
  $labels  = [];

  foreach ($xml->Config ?? [] as $cfg) {
    $type   = strtolower(trim((string)($cfg['Type']   ?? '')));
    $target = trim((string)($cfg['Target'] ?? ''));
    $value  = trim((string)$cfg);
    $mode   = trim((string)($cfg['Mode']   ?? 'rw'));
    $name2  = trim((string)($cfg['Name']   ?? ''));
    $display= trim((string)($cfg['Display'] ?? ''));
    $desc2  = trim((string)($cfg['Description'] ?? ''));

    if (!$value && !in_array($type, ['label'])) continue;

    switch ($type) {
      case 'port':
        if ($target && $value) {
          [$hostPort, $proto] = array_pad(explode('/', $target, 2), 2, 'tcp');
          $ports[] = [
            'host'      => (int)$value,
            'container' => (int)$hostPort,
            'proto'     => $proto,
            'name'      => $name2,
            'desc'      => $desc2,
          ];
        }
        break;

      case 'path':
        if ($target) {
          $volumes[] = [
            'host'      => $value,
            'container' => $target,
            'mode'      => $mode ?: 'rw',
            'name'      => $name2,
          ];
        }
        break;

      case 'variable':
        if ($target) {
          $envVars[] = [
            'key'     => $target,
            'value'   => $value,
            'name'    => $name2,
            'display' => $display,
          ];
        }
        break;

      case 'device':
        if ($target) {
          $devices[] = [
            'host'      => $value,
            'container' => $target,
            'name'      => $name2,
          ];
          // Détection GPU Intel/AMD via device
          if (strpos($value, '/dev/dri') !== false) $gpuIntel = true;
          if (strpos($value, '/dev/kfd') !== false) $gpuIntel = true; // AMD ROCm
        }
        break;

      case 'label':
        if ($target) $labels[] = ['key' => $target, 'value' => $value];
        break;
    }
  }

  // IP statique depuis les variables ou WebAddress
  $staticIp = null;
  if ($webAddress && preg_match('/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/', $webAddress, $m)) {
    $staticIp = $m[1];
  }
  if (!$staticIp) {
    foreach ($envVars as $ev) {
      if (strtoupper($ev['key']) === 'IP' && preg_match('/^\d+\.\d+\.\d+\.\d+$/', $ev['value'])) {
        $staticIp = $ev['value'];
        break;
      }
    }
  }

  // Catégorie normalisée
  $categoryPrimary   = '';
  $categorySecondary = '';
  if ($category) {
    $parts = explode(':', $category, 2);
    $categoryPrimary   = trim($parts[0]);
    $categorySecondary = trim($parts[1] ?? '');
  }

  return [
    'image'       => $image,
    'file'        => $file,
    'display'     => [
      'icon'        => $icon,
      'webui'       => $webui,
      'webui_port'  => $webuiPort,
      'webui_path'  => $webuiPath,
      'description' => $description,
      'support'     => $support,
      'project_url' => $project,
      'category'    => $category,
      'cat_primary' => $categoryPrimary,
      'cat_secondary' => $categorySecondary,
    ],
    'network'     => [
      'mode'      => $network,
      'static_ip' => $staticIp,
      'web_address'=> $webAddress,
    ],
    'security'    => [
      'privileged' => $privileged,
      'cap_add'    => $capAdd,
      'cap_drop'   => $capDrop,
      'sysctl'     => $sysctl,
      'extra_params'=> $extraParams,
      'extra_labels'=> $extraLabels,
    ],
    'gpu'         => [
      'nvidia' => $gpuNvidia,
      'intel'  => $gpuIntel,
      'amd'    => strpos($extraParams, '/dev/kfd') !== false,
    ],
    'is_vpn'      => $isVpn,
    'ports'       => $ports,
    'volumes'     => $volumes,
    'environment' => $envVars,
    'devices'     => $devices,
    'labels'      => $labels,
    'shell'       => $shell,
    'vols_from'   => $volsFrom,
    'mem_limit'   => $memLimit,
    'cpu_set'     => $cpuSet,
  ];
}

// ════════════════════════════════════════════════════════════════════════════
// SOURCE 3 — YAML COMPOSE
// ════════════════════════════════════════════════════════════════════════════

function parseAllComposeYaml(array $inspectRaw): array {
  $yamlFiles = discoverYamlFiles($inspectRaw);
  $result    = []; // indexed by yaml_path

  foreach ($yamlFiles as $yamlPath) {
    $parsed = parseComposeYaml($yamlPath);
    if ($parsed) $result[$yamlPath] = $parsed;
  }

  return $result;
}

function discoverYamlFiles(array $inspectRaw): array {
  $paths = [];

  // Méthode 1: via labels des containers running
  foreach ($inspectRaw as $c) {
    $labels = $c['Config']['Labels'] ?? [];
    // config_files peut contenir plusieurs fichiers séparés par virgule
    $configFiles = $labels['com.docker.compose.project.config_files'] ?? '';
    if ($configFiles) {
      foreach (explode(',', $configFiles) as $f) {
        $f = trim($f);
        if ($f && file_exists($f)) $paths[$f] = true;
      }
    }
    // Fallback: working_dir + docker-compose.yml
    $workDir = $labels['com.docker.compose.project.working_dir'] ?? '';
    if ($workDir) {
      foreach (['docker-compose.yml','docker-compose.yaml','compose.yml','compose.yaml'] as $fname) {
        $fp = rtrim($workDir, '/') . '/' . $fname;
        if (file_exists($fp)) { $paths[$fp] = true; break; }
      }
    }
  }

  // Méthode 2: scan des emplacements connus Unraid
  $knownDirs = [
    '/boot/config/plugins/compose.manager/projects',
    '/boot/config/plugins/dockerMan/compose',
    '/mnt/user/appdata/compose',
  ];
  foreach ($knownDirs as $dir) {
    if (!is_dir($dir)) continue;
    foreach (glob("{$dir}/*/docker-compose.{yml,yaml}", GLOB_BRACE) ?: [] as $f) {
      $paths[$f] = true;
    }
    foreach (glob("{$dir}/*/compose.{yml,yaml}", GLOB_BRACE) ?: [] as $f) {
      $paths[$f] = true;
    }
  }

  return array_keys($paths);
}

function parseComposeYaml(string $yamlPath): ?array {
  if (!file_exists($yamlPath)) return null;

  // Parser YAML via python3 (disponible sur Unraid, gère toute la spec YAML)
  $escaped = escapeshellarg($yamlPath);
  $json = runCmd(
    "python3 -c \"import yaml,json,sys; " .
    "f=open({$escaped},'r'); data=yaml.safe_load(f); " .
    "print(json.dumps(data, default=str))\" 2>/dev/null",
    10
  );

  if (empty($json)) {
    // Fallback: parser YAML minimal intégré à Unraid (Spyc)
    $spycPaths = [
      '/usr/local/emhttp/plugins/dynamix/case/Spyc.php',
      '/usr/local/emhttp/webGui/include/Spyc.php',
    ];
    foreach ($spycPaths as $sp) {
      if (file_exists($sp)) {
        require_once $sp;
        $data = Spyc::YAMLLoad($yamlPath);
        if ($data) { $json = json_encode($data); break; }
      }
    }
  }

  if (empty($json)) return null;
  $compose = json_decode($json, true);
  if (!$compose || !isset($compose['services'])) return null;

  // ── Parser chaque service ─────────────────────────────────────────────────
  $projectName = basename(dirname($yamlPath));
  $services    = [];

  // Charger .env si présent
  $envFile = dirname($yamlPath) . '/.env';
  $envVars = parseEnvFile($envFile);

  foreach ($compose['services'] ?? [] as $svcName => $svc) {
    if (!is_array($svc)) continue;

    $services[$svcName] = parseComposeService($svcName, $svc, $envVars, $compose);
  }

  return [
    'project'  => $projectName,
    'file'     => $yamlPath,
    'version'  => (string)($compose['version'] ?? ''),
    'services' => $services,
    'networks' => $compose['networks'] ?? [],
    'volumes'  => $compose['volumes']  ?? [],
    'secrets'  => array_keys($compose['secrets'] ?? []),
  ];
}

function parseComposeService(string $svcName, array $svc, array $envVars, array $compose): array {
  // ── depends_on avec conditions ─────────────────────────────────────────
  $dependsOn = [];
  $rawDeps = $svc['depends_on'] ?? [];
  if (is_array($rawDeps)) {
    foreach ($rawDeps as $dep => $depCfg) {
      if (is_string($dep)) {
        // Format long: depends_on: {db: {condition: service_healthy}}
        $condition = is_array($depCfg) ? ($depCfg['condition'] ?? 'service_started') : 'service_started';
        $dependsOn[] = ['service' => $dep, 'condition' => $condition];
      } elseif (is_string($depCfg)) {
        // Format court: depends_on: [db, redis]
        $dependsOn[] = ['service' => $depCfg, 'condition' => 'service_started'];
      }
    }
  } elseif (is_string($rawDeps)) {
    $dependsOn[] = ['service' => $rawDeps, 'condition' => 'service_started'];
  }

  // ── healthcheck ─────────────────────────────────────────────────────────
  $healthcheck = null;
  if (!empty($svc['healthcheck'])) {
    $hc = $svc['healthcheck'];
    $test = '';
    if (isset($hc['test'])) {
      if (is_array($hc['test'])) {
        // ["CMD", "mysqladmin", "ping"] ou ["CMD-SHELL", "curl -f ..."]
        $testArr = $hc['test'];
        $testType = array_shift($testArr);
        $test = implode(' ', $testArr);
        if ($testType === 'NONE') $test = '';
      } else {
        $test = (string)$hc['test'];
      }
    }
    if ($test) {
      $healthcheck = [
        'test'         => $test,
        'interval'     => (string)($hc['interval']     ?? '30s'),
        'timeout'      => (string)($hc['timeout']      ?? '30s'),
        'retries'      => (int)($hc['retries']         ?? 3),
        'start_period' => (string)($hc['start_period'] ?? '0s'),
        'disable'      => (bool)($hc['disable']        ?? false),
      ];
    }
  }

  // ── ports ───────────────────────────────────────────────────────────────
  $ports = [];
  foreach ($svc['ports'] ?? [] as $p) {
    if (is_string($p)) {
      // "8080:80", "8080:80/tcp", "127.0.0.1:8080:80"
      if (preg_match('/(?:\S+:)?(\d+):(\d+)(?:\/(\w+))?/', $p, $m)) {
        $ports[] = ['host' => (int)$m[1], 'container' => (int)$m[2], 'proto' => $m[3] ?? 'tcp'];
      }
    } elseif (is_array($p)) {
      $ports[] = [
        'host'      => (int)($p['published'] ?? 0),
        'container' => (int)($p['target']    ?? 0),
        'proto'     => $p['protocol'] ?? 'tcp',
      ];
    }
  }

  // ── volumes ─────────────────────────────────────────────────────────────
  $volumes = [];
  foreach ($svc['volumes'] ?? [] as $v) {
    if (is_string($v)) {
      $parts = explode(':', $v, 3);
      $volumes[] = [
        'host'      => $parts[0],
        'container' => $parts[1] ?? $parts[0],
        'mode'      => $parts[2] ?? 'rw',
      ];
    } elseif (is_array($v)) {
      $volumes[] = [
        'host'      => $v['source'] ?? '',
        'container' => $v['target'] ?? '',
        'mode'      => $v['read_only'] ?? false ? 'ro' : 'rw',
      ];
    }
  }

  // ── environment ─────────────────────────────────────────────────────────
  $environment = [];
  $rawEnv = $svc['environment'] ?? [];
  if (is_array($rawEnv)) {
    foreach ($rawEnv as $k => $v) {
      if (is_int($k)) {
        // ["KEY=value"] format
        [$key, $val] = array_pad(explode('=', (string)$v, 2), 2, '');
        // Résoudre depuis .env si pas de valeur
        if ($val === '' && isset($envVars[$key])) $val = $envVars[$key];
        $environment[] = ['key' => $key, 'value' => $val];
      } else {
        $val = (string)($v ?? '');
        if ($val === '' && isset($envVars[$k])) $val = $envVars[$k];
        $environment[] = ['key' => $k, 'value' => $val];
      }
    }
  }

  // ── networks ────────────────────────────────────────────────────────────
  $networks   = [];
  $rawNets    = $svc['networks'] ?? [];
  if (is_array($rawNets)) {
    foreach ($rawNets as $netName => $netCfg) {
      if (is_int($netName)) {
        $networks[] = ['name' => $netCfg, 'aliases' => [], 'ipv4' => ''];
      } else {
        $networks[] = [
          'name'    => $netName,
          'aliases' => (array)($netCfg['aliases'] ?? []),
          'ipv4'    => (string)($netCfg['ipv4_address'] ?? ''),
          'ipv6'    => (string)($netCfg['ipv6_address'] ?? ''),
        ];
      }
    }
  } elseif (is_string($rawNets)) {
    $networks[] = ['name' => $rawNets, 'aliases' => [], 'ipv4' => ''];
  }

  // ── GPU / devices ────────────────────────────────────────────────────────
  $devices = [];
  foreach ($svc['devices'] ?? [] as $d) {
    if (is_string($d)) {
      $parts = explode(':', $d, 2);
      $devices[] = ['host' => $parts[0], 'container' => $parts[1] ?? $parts[0]];
    }
  }

  $gpuNvidia = false;
  $gpuIntel  = false;
  // Via deploy.resources (Swarm/Compose v3)
  $deploy = $svc['deploy'] ?? [];
  $reservations = $deploy['resources']['reservations'] ?? [];
  if (!empty($reservations['devices'])) {
    foreach ($reservations['devices'] as $dev) {
      $caps = $dev['capabilities'] ?? [];
      if (in_array('gpu', $caps)) $gpuNvidia = true; // générique GPU
    }
  }
  foreach ($devices as $d) {
    if (strpos($d['host'], '/dev/dri') !== false) $gpuIntel = true;
    if (strpos($d['host'], '/dev/kfd') !== false) $gpuIntel = true;
    if (strpos($d['host'], '/dev/nvidia') !== false) $gpuNvidia = true;
  }

  // ── security ────────────────────────────────────────────────────────────
  $capAdd   = (array)($svc['cap_add']  ?? []);
  $capDrop  = (array)($svc['cap_drop'] ?? []);
  $sysctl   = $svc['sysctls'] ?? $svc['sysctl'] ?? [];
  if (!is_array($sysctl)) $sysctl = [];
  $privileged = (bool)($svc['privileged'] ?? false);
  $isVpn = in_array('NET_ADMIN', array_map('strtoupper', $capAdd)) || $privileged;

  // ── labels ───────────────────────────────────────────────────────────────
  $labels = [];
  $rawLabels = $svc['labels'] ?? [];
  if (is_array($rawLabels)) {
    foreach ($rawLabels as $k => $v) {
      if (is_int($k)) {
        [$lk,$lv] = array_pad(explode('=', (string)$v, 2), 2, '');
        $labels[$lk] = $lv;
      } else {
        $labels[$k] = (string)$v;
      }
    }
  }

  // ── restart policy ───────────────────────────────────────────────────────
  $restart = (string)($svc['restart'] ?? 'unless-stopped');

  // ── WebUI port depuis ports (premier port HTTP) ───────────────────────────
  $webuiPort = null;
  foreach ($ports as $p) {
    if ($p['proto'] === 'tcp' && $p['host'] > 0) { $webuiPort = $p['host']; break; }
  }

  return [
    'image'       => (string)($svc['image'] ?? ''),
    'restart'     => $restart,
    'depends_on'  => $dependsOn,
    'healthcheck' => $healthcheck,
    'ports'       => $ports,
    'volumes'     => $volumes,
    'environment' => $environment,
    'networks'    => $networks,
    'devices'     => $devices,
    'labels'      => $labels,
    'security'    => [
      'privileged' => $privileged,
      'cap_add'    => $capAdd,
      'cap_drop'   => $capDrop,
      'sysctl'     => $sysctl,
    ],
    'gpu'         => ['nvidia' => $gpuNvidia, 'intel' => $gpuIntel],
    'is_vpn'      => $isVpn,
    'webui_port'  => $webuiPort,
    'mem_limit'   => (string)($deploy['resources']['limits']['memory'] ?? $svc['mem_limit'] ?? ''),
    'cpu_limit'   => (string)($deploy['resources']['limits']['cpus']   ?? $svc['cpus']     ?? ''),
  ];
}

function parseEnvFile(string $path): array {
  $vars = [];
  if (!file_exists($path)) return $vars;
  foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    $line = trim($line);
    if (str_starts_with($line, '#') || !str_contains($line, '=')) continue;
    [$k, $v] = explode('=', $line, 2);
    $vars[trim($k)] = trim($v, '"\'');
  }
  return $vars;
}

// ════════════════════════════════════════════════════════════════════════════
// FUSION — 3 sources → objet unifié
// ════════════════════════════════════════════════════════════════════════════

function fuseAllSources(array $inspectRaw, array $xmlData, array $yamlData): array {
  // Construire index YAML: containerName → {yaml, service, svcData}
  $yamlIndex = buildYamlIndex($yamlData);

  $result = [];

  foreach ($inspectRaw as $c) {
    $cname  = ltrim($c['Name'] ?? '', '/');
    $image  = $c['Config']['Image'] ?? '';
    $labels = $c['Config']['Labels'] ?? [];

    // ── Trouver les sources pour ce container ─────────────────────────────
    // XML: par nom exact, puis par image
    $xml = $xmlData['byName'][$cname] ?? null;
    if (!$xml) {
      $imgBase = strtolower(preg_replace('/:.*$/', '', $image));
      $xml = $xmlData['byImage'][$imgBase] ?? null;
    }

    // YAML: via labels compose ou index nom de service
    $yaml      = null;
    $yamlSvc   = null;
    $yamlFile  = '';
    $yamlProj  = '';

    $composeProject = $labels['com.docker.compose.project'] ?? '';
    $composeService = $labels['com.docker.compose.service'] ?? '';

    if ($composeProject && $composeService) {
      // Chercher dans yamlIndex
      $yKey = $composeProject . '::' . $composeService;
      if (isset($yamlIndex[$yKey])) {
        $yEntry  = $yamlIndex[$yKey];
        $yaml    = $yEntry['yaml'];
        $yamlSvc = $yEntry['service'];
        $yamlFile = $yaml['file'];
        $yamlProj = $yaml['project'];
      }
      // Chercher aussi par nom de container
      if (!$yaml && isset($yamlIndex[$composeProject . '::' . $cname])) {
        $yEntry  = $yamlIndex[$composeProject . '::' . $cname];
        $yaml    = $yEntry['yaml'];
        $yamlSvc = $yEntry['service'];
        $yamlFile = $yaml['file'];
        $yamlProj = $yaml['project'];
      }
    }

    // ── ÉTAT (toujours depuis inspect) ────────────────────────────────────
    $state = [
      'status'      => $c['State']['Status']     ?? 'unknown',
      'running'     => $c['State']['Running']    ?? false,
      'paused'      => $c['State']['Paused']     ?? false,
      'restarting'  => $c['State']['Restarting'] ?? false,
      'started_at'  => $c['State']['StartedAt']  ?? '',
      'exit_code'   => $c['State']['ExitCode']   ?? 0,
      'health'      => $c['State']['Health']['Status'] ?? '',
    ];

    // ── IMAGE (XML prime pour le tag exact) ───────────────────────────────
    $imageFinal = $xml ? ($xml['image'] ?: $image) : $image;
    if ($yamlSvc && !empty($yamlSvc['image'])) {
      if (!$xml || !$xml['image']) $imageFinal = $yamlSvc['image'];
    }

    // ── DISPLAY (XML prime, YAML labels en fallback) ──────────────────────
    $display = [
      'icon'          => '',
      'webui'         => '',
      'webui_port'    => null,
      'webui_path'    => '/',
      'description'   => '',
      'category'      => '',
      'cat_primary'   => '',
      'cat_secondary' => '',
    ];
    if ($xml) {
      $display = array_merge($display, $xml['display']);
    }
    // Icône depuis label Unraid si XML absent
    if (!$display['icon'] && isset($labels['net.unraid.docker.icon'])) {
      $display['icon'] = $labels['net.unraid.docker.icon'];
    }
    if (!$display['webui_port'] && $yamlSvc) {
      $display['webui_port'] = $yamlSvc['webui_port'];
    }

    // ── RÉSEAU ────────────────────────────────────────────────────────────
    $network = [
      'mode'       => 'bridge',
      'static_ip'  => null,
      'ip_runtime' => '',
      'ports'      => [],
    ];
    // Runtime IP depuis inspect
    $nsNetworks = $c['NetworkSettings']['Networks'] ?? [];
    foreach ($nsNetworks as $netName => $netInfo) {
      if (!empty($netInfo['IPAddress'])) {
        $network['ip_runtime'] = $netInfo['IPAddress'];
        break;
      }
    }
    // Config depuis XML
    if ($xml) {
      $network['mode']      = $xml['network']['mode']      ?: 'bridge';
      $network['static_ip'] = $xml['network']['static_ip'];
      $network['ports']     = $xml['ports'];
    }
    // Override avec YAML si compose
    if ($yamlSvc) {
      if (!empty($yamlSvc['networks'])) {
        foreach ($yamlSvc['networks'] as $n) {
          if (!empty($n['ipv4'])) { $network['static_ip'] = $n['ipv4']; break; }
        }
      }
      if (empty($network['ports'])) $network['ports'] = $yamlSvc['ports'];
    }
    // Fallback inspect pour les ports runtime
    if (empty($network['ports'])) {
      $hostConfig = $c['HostConfig']['PortBindings'] ?? [];
      foreach ($hostConfig as $cp => $bindings) {
        if (!is_array($bindings)) continue;
        [$cPort, $proto] = array_pad(explode('/', $cp, 2), 2, 'tcp');
        foreach ($bindings as $b) {
          if (!empty($b['HostPort'])) {
            $network['ports'][] = [
              'host'      => (int)$b['HostPort'],
              'container' => (int)$cPort,
              'proto'     => $proto,
              'name'      => '',
            ];
          }
        }
      }
    }

    // ── SÉCURITÉ / GPU / VPN (XML + YAML fusionnés) ───────────────────────
    $security = [
      'privileged'  => false,
      'cap_add'     => [],
      'cap_drop'    => [],
      'sysctl'      => [],
      'extra_params'=> '',
    ];
    $gpu    = ['nvidia' => false, 'intel' => false, 'amd' => false];
    $isVpn  = false;

    if ($xml) {
      $security = array_merge($security, $xml['security']);
      $gpu      = array_merge($gpu, $xml['gpu']);
      $isVpn    = $xml['is_vpn'];
    }
    if ($yamlSvc) {
      // Fusionner cap_add (union)
      $security['cap_add']  = array_unique(array_merge($security['cap_add'],  $yamlSvc['security']['cap_add']));
      $security['cap_drop'] = array_unique(array_merge($security['cap_drop'], $yamlSvc['security']['cap_drop']));
      if ($yamlSvc['security']['privileged']) $security['privileged'] = true;
      $security['sysctl']   = array_merge($security['sysctl'], $yamlSvc['security']['sysctl']);
      // GPU union
      if ($yamlSvc['gpu']['nvidia']) $gpu['nvidia'] = true;
      if ($yamlSvc['gpu']['intel'])  $gpu['intel']  = true;
      if ($yamlSvc['is_vpn'])        $isVpn         = true;
    }
    // Fallback inspect
    if (!$security['privileged'] && ($c['HostConfig']['Privileged'] ?? false)) {
      $security['privileged'] = true;
    }

    // ── VOLUMES (XML prime, YAML fallback, inspect si rien) ───────────────
    $volumes = [];
    if ($xml && !empty($xml['volumes'])) {
      $volumes = $xml['volumes'];
    } elseif ($yamlSvc && !empty($yamlSvc['volumes'])) {
      $volumes = $yamlSvc['volumes'];
    } else {
      foreach ($c['Mounts'] ?? [] as $m) {
        if ($m['Type'] === 'bind') {
          $volumes[] = ['host' => $m['Source'], 'container' => $m['Destination'], 'mode' => $m['Mode'] ?: 'rw', 'name' => ''];
        }
      }
    }

    // ── ENVIRONMENT (XML prime) ────────────────────────────────────────────
    $environment = [];
    if ($xml && !empty($xml['environment'])) {
      $environment = $xml['environment'];
    } elseif ($yamlSvc && !empty($yamlSvc['environment'])) {
      $environment = $yamlSvc['environment'];
    }

    // ── DEVICES (union XML + YAML) ────────────────────────────────────────
    $devices = array_merge($xml['devices'] ?? [], $yamlSvc['devices'] ?? []);

    // ── DÉPENDANCES (YAML prime, sinon labels compose) ────────────────────
    $dependsOn = [];
    if ($yamlSvc && !empty($yamlSvc['depends_on'])) {
      $dependsOn = $yamlSvc['depends_on'];
    } else {
      $rawDeps = $labels['com.docker.compose.depends_on'] ?? '';
      if ($rawDeps) {
        foreach (explode(',', $rawDeps) as $dep) {
          $dep = trim($dep);
          if ($dep) $dependsOn[] = ['service' => $dep, 'condition' => 'service_started'];
        }
      }
    }

    // ── HEALTHCHECK (YAML natif prime, puis DSM preset) ───────────────────
    $healthcheck = null;
    if ($yamlSvc && !empty($yamlSvc['healthcheck'])) {
      $healthcheck = $yamlSvc['healthcheck'];
      $healthcheck['source'] = 'yaml';
    }
    // Healthcheck docker natif (depuis inspect)
    if (!$healthcheck) {
      $hcConfig = $c['Config']['Healthcheck'] ?? [];
      $hcTest   = $hcConfig['Test'] ?? [];
      if (!empty($hcTest) && $hcTest[0] !== 'NONE') {
        $testArr  = $hcTest;
        $testType = array_shift($testArr);
        $test     = implode(' ', $testArr);
        if ($test) {
          $healthcheck = [
            'source'       => 'docker',
            'test'         => $test,
            'interval'     => formatNs($hcConfig['Interval']    ?? 0),
            'timeout'      => formatNs($hcConfig['Timeout']     ?? 0),
            'retries'      => $hcConfig['Retries']              ?? 3,
            'start_period' => formatNs($hcConfig['StartPeriod'] ?? 0),
            'disable'      => false,
          ];
        }
      }
    }

    // ── COMPOSE metadata ──────────────────────────────────────────────────
    $compose = [
      'project'     => $composeProject ?: $yamlProj,
      'service'     => $composeService,
      'yaml_path'   => $yamlFile,
      'working_dir' => $labels['com.docker.compose.project.working_dir'] ?? dirname($yamlFile),
      'depends_on'  => $dependsOn,
    ];
    if ($yaml) {
      $compose['yaml_networks'] = $yaml['networks'] ?? [];
      $compose['yaml_secrets']  = $yaml['secrets']  ?? [];
    }

    // ── UNRAID metadata ───────────────────────────────────────────────────
    $unraid = [
      'has_template'  => (bool)$xml,
      'template_path' => $xml ? $xml['file']  : '',
      'shell'         => $xml ? $xml['shell']  : 'sh',
      'vols_from'     => $xml ? $xml['vols_from'] : '',
      'mem_limit'     => $xml ? $xml['mem_limit'] : ($yamlSvc['mem_limit'] ?? ''),
      'cpu_set'       => $xml ? $xml['cpu_set']   : ($yamlSvc['cpu_limit'] ?? ''),
    ];

    // ── Objet final ───────────────────────────────────────────────────────
    $result[] = [
      'Name'        => $cname,
      'Id'          => $c['Id'] ?? '',
      'Image'       => $imageFinal,
      'State'       => $state,
      'display'     => $display,
      'network'     => $network,
      'security'    => $security,
      'gpu'         => $gpu,
      'is_vpn'      => $isVpn,
      'volumes'     => $volumes,
      'environment' => $environment,
      'devices'     => $devices,
      'healthcheck' => $healthcheck,
      'compose'     => $compose,
      'unraid'      => $unraid,
      // Compatibilité avec l'ancien format (pour classify.js)
      'Config'          => $c['Config'],
      'HostConfig'      => $c['HostConfig'],
      'NetworkSettings' => $c['NetworkSettings'],
      'Mounts'          => $c['Mounts'] ?? [],
    ];
  }

  return $result;
}

function buildYamlIndex(array $yamlData): array {
  $index = [];
  foreach ($yamlData as $yamlPath => $yaml) {
    $project = $yaml['project'];
    foreach ($yaml['services'] as $svcName => $svcData) {
      $index[$project . '::' . $svcName] = [
        'yaml'    => $yaml,
        'service' => $svcData,
        'svc_name'=> $svcName,
      ];
    }
  }
  return $index;
}

function formatNs(int $ns): string {
  if ($ns <= 0) return '0s';
  $s = (int)($ns / 1e9);
  if ($s >= 60) return ($s / 60) . 'm';
  return $s . 's';
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATES UNRAID (action séparée pour compatibilité)
// ════════════════════════════════════════════════════════════════════════════

function readUnraidTemplates(): array {
  $xmlData = parseAllXmlTemplates();
  $templates = [];
  foreach ($xmlData['byName'] as $name => $tpl) {
    $templates[] = array_merge(['name' => $name], $tpl);
  }
  return ['success' => true, 'templates' => $templates, 'count' => count($templates)];
}

// ════════════════════════════════════════════════════════════════════════════
// CONTAINER STATUS
// ════════════════════════════════════════════════════════════════════════════

function containerStatus(): array {
  // Une seule commande batch: noms + statut + health
  $output = runCmd(DOCKER_BIN . ' ps -a --format "{{.Names}}\t{{.Status}}\t{{.Health}}"', 10);
  $result = [];
  foreach (explode("\n", trim($output)) as $line) {
    if (!$line) continue;
    [$name, $status, $health] = array_pad(explode("\t", $line, 3), 3, '');
    // Normaliser le statut en catégorie simple
    $cat = 'stopped';
    if (str_starts_with($status, 'Up') || str_starts_with($status, 'running')) {
      if ($health === 'healthy')                              $cat = 'healthy';
      elseif ($health === 'starting' || $health === 'unhealthy') $cat = 'starting';
      else                                                    $cat = 'running';
    } elseif (str_contains($status, 'Restarting'))           $cat = 'starting';
    $result[$name] = ['raw' => $status, 'health' => $health, 'cat' => $cat];
  }
  return ['success' => true, 'statuses' => $result];
}

// ════════════════════════════════════════════════════════════════════════════
// CONFIG / SCRIPTS
// ════════════════════════════════════════════════════════════════════════════

function saveConfig(array $data): array {
  if (empty($data)) return ['success' => false, 'error' => 'Données vides'];
  if (!is_dir(CONFIG_DIR)) mkdir(CONFIG_DIR, 0755, true);
  // Préserver les champs non envoyés par le JS (ex: scripts[], savedAt précédent)
  $existing = [];
  if (file_exists(CONFIG_FILE)) {
    $raw = @file_get_contents(CONFIG_FILE);
    $existing = $raw ? (json_decode($raw, true) ?? []) : [];
  }
  // Fusionner: les champs JS écrasent, les champs absents sont préservés
  foreach (['scripts', 'importedNames'] as $preserve) {
    if (!isset($data[$preserve]) && isset($existing[$preserve])) {
      $data[$preserve] = $existing[$preserve];
    }
  }
  // Forcer les sous-tableaux vides en objets JSON pour éviter [] au lieu de {}
  $forceObj = function(&$arr, $keys) {
    foreach ($keys as $k) {
      if (isset($arr[$k]) && is_array($arr[$k]) && empty($arr[$k])) {
        $arr[$k] = new stdClass();
      }
    }
  };
  if (isset($data['settings'])) {
    $forceObj($data['settings'], ['services','timing','pauses','container_timeouts']);
  }
  if (isset($data['prefs']) && is_array($data['prefs']) && empty($data['prefs'])) {
    $data['prefs'] = new stdClass();
  }
  // savedAt mis à jour seulement si l'utilisateur a explicitement modifié la config
  // Le JS envoie userModified=true uniquement lors de vraies modifications (drag-drop, etc.)
  $userModified = !empty($data['userModified']);
  unset($data['userModified']);
  if ($userModified || !isset($existing['savedAt'])) {
    $data['savedAt'] = date('c');
  } else {
    $data['savedAt'] = $existing['savedAt']; // Conserver savedAt si pas de modif réelle
  }
  $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
  if (!$json) return ['success' => false, 'error' => 'JSON: ' . json_last_error_msg()];
  $tmp = CONFIG_FILE . '.tmp';
  if (file_put_contents($tmp, $json) === false) return ['success' => false, 'error' => 'Écriture impossible'];
  rename($tmp, CONFIG_FILE);
  return ['success' => true, 'message' => 'Sauvegardé', 'savedAt' => $data['savedAt']];
}

function loadConfig(): array {
  $defaults = [
    'groups'  => [],
    'pool'    => [],
    'settings'=> (object)[], // objet vide {} pas tableau []
    'prefs'   => (object)[],
  ];
  if (!file_exists(CONFIG_FILE)) {
    return ['success' => true, 'config' => $defaults];
  }
  $raw = @file_get_contents(CONFIG_FILE);
  $cfg = $raw ? json_decode($raw, true) : null;
  if (!$cfg) return ['success' => false, 'error' => 'Config illisible'];
  // Normaliser settings/prefs en objet (pas tableau) pour éviter TypeError JS
  if (!isset($cfg['settings']) || !is_array($cfg['settings'])) $cfg['settings'] = [];
  if (!isset($cfg['prefs'])    || !is_array($cfg['prefs']))    $cfg['prefs']    = [];
  // S'assurer que settings a les clés attendues
  $cfg['settings'] = array_merge(['services'=>[], 'timing'=>[], 'pauses'=>[]], $cfg['settings']);
  return ['success' => true, 'config' => $cfg];
}

function installScript(array $data): array {
  // $data est déjà parsé par le router (JSON ou form-urlencoded)
  // Accepter 'script' (raw) ou 'content' (base64)
  $encoded = $data['encoded'] ?? false;
  $raw     = $data['script']  ?? $data['content'] ?? '';
  $script  = $encoded ? base64_decode($raw) : $raw;
  $mode    = $data['mode'] ?? 'start';
  // Toujours forcer le nom canonique UDO — ignore tout nom hérité de l'ancienne config
  $name    = 'unraid-docker-orchestrator-' . $mode;

  if (!$script || !trim($script)) {
    return ['success' => false, 'error' => 'Script vide (reçu: ' . strlen($raw) . ' chars)'];
  }

  $scriptDir = '/boot/config/plugins/user.scripts/scripts';
  if (!is_dir($scriptDir)) {
    return ['success' => false, 'error' => "user.scripts non installé: {$scriptDir}"];
  }

  $dir = "{$scriptDir}/{$name}";
  if (!is_dir($dir)) mkdir($dir, 0755, true);

  $scriptFile = "{$dir}/script";
  file_put_contents($scriptFile, $script);
  chmod($scriptFile, 0755);

  // Fréquence : lire la valeur déjà configurée dans config.json
  // pour ne pas écraser un cron que l'utilisateur a déjà défini
  $existingCfg = loadConfig()['config'] ?? [];
  $existingCron = $existingCfg['cron'][$mode] ?? '';

  $scheduleMap = [
    'At Startup of Array'  => 'start',
    'At Stopping of Array' => 'stop',
    ''                     => 'disabled',
  ];

  if ($existingCron && !isset($scheduleMap[$existingCron])) {
    // Expression cron custom déjà enregistrée (ex: '0 3 * * *')
    $frequency = 'custom';
    $customVal = $existingCron;
  } elseif ($existingCron && isset($scheduleMap[$existingCron])) {
    // At Startup / At Stopping
    $frequency = $scheduleMap[$existingCron];
    $customVal = '';
  } else {
    // Aucun cron configuré — valeurs par défaut selon le mode
    $freqMap   = ['start' => 'start', 'stop' => 'stop', 'update' => 'disabled'];
    $frequency = $freqMap[$mode] ?? 'disabled';
    $customVal = '';
  }

  file_put_contents("{$dir}/name",        $name);
  file_put_contents("{$dir}/description", "Unraid Docker Orchestrator — {$mode}");

  // Écrire dans schedule.json (seul fichier lu par User Scripts)
  $scheduleJson = '/boot/config/plugins/user.scripts/schedule.json';
  $sched = [];
  if (file_exists($scheduleJson)) {
    $sched = json_decode(file_get_contents($scheduleJson), true) ?: [];
  }
  $scriptId = 'schedule' . str_replace(' ', '', str_replace('.', '-', $name));
  $sched[$scriptFile] = [
    'script'    => $scriptFile,
    'frequency' => $frequency,
    'id'        => $scriptId,
    'custom'    => $customVal,
  ];
  file_put_contents($scheduleJson, json_encode($sched, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

  // Marquer la date de génération APRÈS saveConfig pour que generatedAt > savedAt
  $cfg2 = loadConfig()['config'] ?? [];
  if (!isset($cfg2['scripts'])) $cfg2['scripts'] = [];
  // Stocker un hash de la config au moment de l'installation
  // checkScriptsFresh comparera ce hash avec le hash actuel → insensible aux timestamps
  // Hash de l'état réel Docker au moment de l'installation
  // (liste containers + mtimes XML templates)
  $configHash = computeDockerStateHash();
  $cfg2['scripts'][$mode] = [
    'generatedAt' => date('c'),
    'configHash'  => $configHash,
    'name'        => $name,
  ];
  // Écriture directe sans passer par saveConfig (évite que savedAt > generatedAt)
  if (!is_dir(CONFIG_DIR)) mkdir(CONFIG_DIR, 0755, true);
  $json2 = json_encode($cfg2, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
  $tmp2  = CONFIG_FILE . '.tmp';
  if ($json2 && file_put_contents($tmp2, $json2) !== false) rename($tmp2, CONFIG_FILE);

  return ['success' => true, 'message' => "Installé : {$name} ({$frequency})", 'path' => $scriptFile];
}

function runScript(array $data): array {
  $script = $data['script'] ?? '';
  if (!$script) return ['success' => false, 'error' => 'Script vide'];

  $tmp = tempnam('/tmp', 'dsm_run_');
  file_put_contents($tmp, $script);
  chmod($tmp, 0755);

  $output = runCmd("bash {$tmp} 2>&1", 120);
  @unlink($tmp);
  return ['success' => true, 'output' => $output];
}

function saveCron(array $data): array {
  $type     = $data['type']     ?? '';
  $schedule = $data['schedule'] ?? $data['cron'] ?? '';
  $valid    = ['update', 'start', 'stop'];
  if (!in_array($type, $valid)) return ['success' => false, 'error' => 'Type invalide'];

  // 1. Sauvegarder dans config.json
  $cfg = loadConfig()['config'] ?? [];
  if (!isset($cfg['cron'])) $cfg['cron'] = [];
  $cfg['cron'][$type] = $schedule;
  $result = saveConfig($cfg);
  if (!$result['success']) return $result;

  // 2. Mettre à jour schedule.json de User Scripts
  $scheduleMap = [
    'At Startup of Array'  => 'start',
    'At Stopping of Array' => 'stop',
    ''                     => 'disabled',
  ];
  // Valeur cron → frequency=custom + custom=expression
  $isCustomCron = $schedule && !isset($scheduleMap[$schedule]);
  $frequency    = $isCustomCron ? 'custom' : ($scheduleMap[$schedule] ?? 'disabled');
  $customVal    = $isCustomCron ? $schedule : '';

  $scriptName   = 'unraid-docker-orchestrator-' . $type;
  $scriptPath   = '/boot/config/plugins/user.scripts/scripts/' . $scriptName . '/script';
  $scheduleJson = '/boot/config/plugins/user.scripts/schedule.json';
  $scriptDir    = '/boot/config/plugins/user.scripts/scripts/' . $scriptName;

  if (is_dir($scriptDir)) {
    // Lire le schedule.json existant
    $sched = [];
    if (file_exists($scheduleJson)) {
      $sched = json_decode(file_get_contents($scheduleJson), true) ?: [];
    }
    // Mettre à jour ou créer l'entrée pour ce script
    $scriptId = 'schedule' . str_replace(' ', '', str_replace('.', '-', $scriptName));
    $sched[$scriptPath] = [
      'script'    => $scriptPath,
      'frequency' => $frequency,
      'id'        => $scriptId,
      'custom'    => $customVal,
    ];
    file_put_contents($scheduleJson, json_encode($sched, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    $result['user_script_updated'] = true;
  } else {
    $result['user_script_updated'] = false;
  }

  $result['schedule'] = $schedule;
  $result['type']     = $type;
  return $result;
}

function readLog(): array {
  $mode = $_GET['mode'] ?? $_POST['mode'] ?? '';

  $logFiles = [
    'start'  => '/tmp/udo_start_order.log',
    'stop'   => '/tmp/udo_stop_order.log',
    'update' => '/tmp/udo_update_order.log',
  ];
  $lockFiles = [
    'start'  => '/tmp/udo_start.lock',
    'stop'   => '/tmp/udo_stop.lock',
    'update' => '/tmp/udo_update.lock',
  ];

  // Si mode spécifié, lire ce log précisément
  if ($mode && isset($logFiles[$mode])) {
    $f = $logFiles[$mode];
    $lock = $lockFiles[$mode];
    $running = file_exists($lock);
    if (!file_exists($f)) {
      return ['success' => true, 'log' => '', 'mode' => $mode, 'running' => $running, 'mtime' => 0];
    }
    $content = file_get_contents($f);
    // Détecter erreurs dans le log
    $hasError = (bool) preg_match('/ERREUR|ROLLBACK ECHEC|TIMEOUT:/i', $content);
    return [
      'success' => true,
      'log'     => $content,
      'mode'    => $mode,
      'running' => $running,
      'mtime'   => filemtime($f),
      'hasError'=> $hasError,
    ];
  }

  // Sans mode: retourner le plus récent (compatibilité)
  $latest = ''; $latestTime = 0; $latestMode = '';
  foreach ($logFiles as $m => $f) {
    if (file_exists($f) && filemtime($f) > $latestTime) {
      $latestTime = filemtime($f); $latest = $f; $latestMode = $m;
    }
  }
  if (!$latest) return ['success' => true, 'log' => '', 'mode' => '', 'running' => false, 'mtime' => 0];
  $content  = file_get_contents($latest);
  $hasError = (bool) preg_match('/ERREUR|ROLLBACK ECHEC|TIMEOUT:/i', $content);
  return [
    'success' => true,
    'log'     => $content,
    'mode'    => $latestMode,
    'running' => file_exists($lockFiles[$latestMode]),
    'mtime'   => $latestTime,
    'hasError'=> $hasError,
  ];
}

function clearLog(): array {
  $mode = $_GET['mode'] ?? $_POST['mode'] ?? '';
  $logFiles = [
    'start'  => '/tmp/udo_start_order.log',
    'stop'   => '/tmp/udo_stop_order.log',
    'update' => '/tmp/udo_update_order.log',
  ];
  if ($mode && isset($logFiles[$mode])) {
    @unlink($logFiles[$mode]);
    return ['success' => true];
  }
  return ['success' => false, 'error' => 'Mode invalide'];
}

// ════════════════════════════════════════════════════════════════════════════
// UTILITAIRES
// ════════════════════════════════════════════════════════════════════════════

function runCmd(string $cmd, int $timeout = 30): string {
  $desc = [1 => ['pipe','w'], 2 => ['pipe','w']];
  $proc = proc_open("timeout {$timeout} {$cmd}", $desc, $pipes);
  if (!is_resource($proc)) return '';
  $out = stream_get_contents($pipes[1]);
  fclose($pipes[1]);
  fclose($pipes[2]);
  proc_close($proc);
  return $out ?: '';
}


// ════════════════════════════════════════════════════════════════════════════

function checkDrift(array $data = []): array {
  $cfg = loadConfig()['config'] ?? [];

  // Référence = importedNames (tous les containers vus lors du dernier import)
  // Si importedNames est vide → aucune référence → pas de dérive possible
  $importedNames = $cfg['importedNames'] ?? [];
  if (empty($importedNames)) {
    return ['success' => true, 'drift' => false, 'added' => [], 'removed' => [],
            'current_count' => 0, 'known_count' => 0, 'no_reference' => true];
  }

  // Liste des containers actuels depuis docker
  $output  = runCmd(DOCKER_BIN . ' ps -a --format "{{.Names}}"', 10);
  $current = array_values(array_filter(array_map('trim', explode("
", trim($output ?? '')))));

  $known   = array_values(array_unique(array_filter(array_map('trim', $importedNames))));

  // Nouveaux = présents sur Docker mais pas dans la référence DSM
  // Supprimés = dans la référence DSM mais plus sur Docker
  $added   = array_values(array_diff($current, $known));
  $removed = array_values(array_diff($known, $current));

  $hasDrift = count($added) > 0 || count($removed) > 0;

  // Notification Unraid (une seule fois par dérive, ticket unique -x)
  if ($hasDrift) {
    $notify = '/usr/local/emhttp/plugins/dynamix/scripts/notify';
    if (is_executable($notify)) {
      $parts = [];
      if ($added)   $parts[] = count($added)   . ' nouveau(x): ' . implode(', ', array_slice($added, 0, 5))   . (count($added)   > 5 ? '…' : '');
      if ($removed) $parts[] = count($removed) . ' supprimé(s): ' . implode(', ', array_slice($removed, 0, 5)) . (count($removed) > 5 ? '…' : '');
      // Écrire directement le fichier .notify (contournement bug getopt PHP notify)
    $notifDir = '/tmp/notifications';
    @mkdir("$notifDir/unread",  0755, true);
    @mkdir("$notifDir/archive", 0755, true);
    $notifFile = "$notifDir/unread/Unraid_Docker_Orchestrator.notify";
    $ts = time();
    $subject = 'Scripts UDO obsoletes - containers modifies';
    $desc    = implode(' | ', $parts);
    $content = "timestamp={$ts}\n"
             . "event=\"Unraid Docker Orchestrator\"\n"
             . "subject=\"" . addslashes($subject) . "\"\n"
             . "description=\"" . addslashes($desc) . "\"\n"
             . "importance=\"warning\"\n"
             . "link=\"/Settings/DSM\"\n";
    file_put_contents($notifFile, $content);
    @chmod($notifFile, 0666);
    }
  }

  return [
    'success'       => true,
    'drift'         => $hasDrift,
    'added'         => $added,
    'removed'       => $removed,
    'current_count' => count($current),
    'known_count'   => count($known),
  ];
}


// ════════════════════════════════════════════════════════════════════════════

function installWatcher(array $data = []): array {
  $action  = $data['action']  ?? 'install';  // install | remove | status
  $plugin  = '/boot/config/plugins/unraid-docker-orchestrator';
  $watcher = $plugin . '/udo-watcher.sh';
  $us_dir  = '/boot/config/plugins/user.scripts/scripts/udo-watcher';

  if ($action === 'status') {
    return [
      'success'   => true,
      'installed' => is_dir($us_dir),
      'watcher_exists' => file_exists($watcher),
    ];
  }

  if ($action === 'remove') {
    if (is_dir($us_dir)) {
      shell_exec('rm -rf ' . escapeshellarg($us_dir));
    }
    return ['success' => true, 'message' => 'Watcher désinstallé'];
  }

  // install
  if (!file_exists($watcher)) {
    return ['success' => false, 'error' => 'udo-watcher.sh introuvable'];
  }
  if (!is_dir('/boot/config/plugins/user.scripts/scripts')) {
    return ['success' => false, 'error' => 'User Scripts plugin non installé'];
  }

  @mkdir($us_dir, 0755, true);

  // Script principal
  copy($watcher, $us_dir . '/script');
  chmod($us_dir . '/script', 0755);

  // Nom du script
  file_put_contents($us_dir . '/name', 'UDO Watcher');

  // Description
  file_put_contents($us_dir . '/description',
    'Unraid Docker Orchestrator — surveille les événements Docker et notifie si les scripts sont obsolètes.');

  // Schedule: at startup of array
  file_put_contents($us_dir . '/schedule', 'At Startup of Array');

  return ['success' => true, 'message' => 'Watcher installé dans User Scripts'];
}

// ── Mise à jour du fichier schedule dans User Scripts ─────────────────────────
function updateSchedule(array $data): array {
  $name     = $data['name']     ?? '';
  $schedule = $data['schedule'] ?? '';
  if (!$name) return ['success' => false, 'error' => 'Nom manquant'];
  $dir = '/boot/config/plugins/user.scripts/scripts/' . $name;
  if (!is_dir($dir)) return ['success' => false, 'error' => 'Script non installé'];
  file_put_contents("{$dir}/schedule", $schedule);
  return ['success' => true];
}

// ── Lire les schedules depuis User Scripts schedule.json ──────────────────────
function getSchedules(): array {
  $scheduleJson = '/boot/config/plugins/user.scripts/schedule.json';
  if (!file_exists($scheduleJson)) return ['success' => true, 'schedules' => []];

  $raw   = file_get_contents($scheduleJson);
  $sched = json_decode($raw, true) ?: [];

  // Extraire uniquement les scripts UDO
  $result = [];
  $prefix = 'unraid-docker-orchestrator-';
  foreach ($sched as $path => $entry) {
    $name = basename(dirname($path));
    if (strpos($name, $prefix) === 0) {
      $type = str_replace($prefix, '', $name);  // start | stop | update
      $result[$type] = [
        'frequency' => $entry['frequency'] ?? 'disabled',
        'custom'    => $entry['custom']    ?? '',
      ];
    }
  }
  return ['success' => true, 'schedules' => $result];
}

// ── Vérifier si les scripts installés sont à jour par rapport à la config ──

// ── Hash de l'état réel Docker (containers + XML templates) ─────────────────
function computeDockerStateHash(): string {
  // 1. Liste des containers Docker (triée pour stabilité)
  $output  = runCmd(DOCKER_BIN . ' ps -a --format "{{.Names}}"', 10);
  $containers = array_values(array_filter(array_map('trim', explode("\n", trim($output ?? '')))));
  sort($containers);

  // 2. Timestamps de modification des XML templates
  $xmlDir  = '/boot/config/plugins/dockerMan/templates-user';
  $xmlMtimes = [];
  if (is_dir($xmlDir)) {
    foreach (glob($xmlDir . '/my-*.xml') as $xmlFile) {
      $xmlMtimes[basename($xmlFile)] = filemtime($xmlFile);
    }
  }
  ksort($xmlMtimes);

  return md5(json_encode(['containers' => $containers, 'xml_mtimes' => $xmlMtimes]));
}



// ── Debug autostart (diagnostic) ────────────────────────────────────────────
function debugAutostart(): array {
  $autostartFile = '/var/lib/docker/unraid-autostart';
  $result = [
    'file'    => $autostartFile,
    'exists'  => file_exists($autostartFile),
    'writable'=> is_writable($autostartFile),
  ];
  if ($result['exists']) {
    $lines = array_filter(array_map('trim',
      file($autostartFile, FILE_IGNORE_NEW_LINES) ?: []
    ));
    $result['containers'] = array_values($lines);
    $result['count']      = count($lines);
  }
  return $result;
}

// ── Désactivation du démarrage automatique Unraid ────────────────────────────
function disableUnraidAutostart(): array {
  $autostartFile = '/var/lib/docker/unraid-autostart';

  // Lire les conteneurs actuellement en autostart
  $containers = [];
  if (file_exists($autostartFile)) {
    $containers = array_filter(array_map('trim',
      file($autostartFile, FILE_IGNORE_NEW_LINES) ?: []
    ));
  }

  $count = count($containers);
  if ($count === 0) {
    return ['success' => true, 'message' => 'Aucun autostart actif', 'count' => 0];
  }

  // Tenter file_put_contents (fonctionne si PHP tourne en root)
  $ok = (@file_put_contents($autostartFile, '') !== false);

  // Fallback : shell_exec truncate
  if (!$ok) {
    shell_exec('truncate -s 0 ' . escapeshellarg($autostartFile) . ' 2>/dev/null');
    $ok = (file_exists($autostartFile) && filesize($autostartFile) === 0);
  }

  // Fallback : unlink + recreate
  if (!$ok) {
    @unlink($autostartFile);
    $ok = !file_exists($autostartFile);
  }

  if (!$ok) {
    return ['success' => false, 'error' => 'Impossible de modifier ' . $autostartFile . ' (owner: ' . fileowner($autostartFile) . ', writable: ' . (is_writable($autostartFile) ? 'oui' : 'non') . ')'];
  }

  return ['success' => true, 'count' => $count, 'containers' => array_values($containers)];
}

function checkScriptsFresh(): array {
  $cfg     = loadConfig()['config'] ?? [];
  $savedAt = $cfg['savedAt'] ?? null;
  $scripts = $cfg['scripts'] ?? [];

  $tSaved = $savedAt ? strtotime($savedAt) : 0;
  $staleScripts = [];

  foreach (['start', 'stop', 'update'] as $mode) {
    $scriptDir  = '/boot/config/plugins/user.scripts/scripts/unraid-docker-orchestrator-' . $mode;
    $scriptFile = $scriptDir . '/script';

    // Script pas installé → pas concerné
    if (!file_exists($scriptFile)) continue;

    $genAt = $scripts[$mode]['generatedAt'] ?? null;

    if (!$genAt) {
      // Installé mais jamais tracé par UDO → obsolète
      $staleScripts[] = $mode;
      continue;
    }

    if (!$savedAt) {
      // Pas de config sauvegardée mais script installé → obsolète (config a changé)
      $staleScripts[] = $mode;
      continue;
    }

    // Comparer le hash de config actuel avec celui stocké à l'installation
    $storedHash = $scripts[$mode]['configHash'] ?? null;
    if ($storedHash) {
      // Recalculer le hash de l'état Docker actuel
      $currentHash = computeDockerStateHash();
      if ($currentHash !== $storedHash) {
        $staleScripts[] = $mode;
      }
    } else {
      // Ancien format sans hash → fallback timestamp
      if ($tSaved > strtotime($genAt)) {
        $staleScripts[] = $mode;
      }
    }
  }

  // Aucun script installé mais config existe → signaler quand même si pas de generatedAt du tout
  if (empty($staleScripts) && $savedAt && empty($scripts)) {
    // Config sauvegardée mais aucun script jamais généré → tous obsolètes potentiels
    // (seulement si au moins un script existe dans User Scripts)
    foreach (['start', 'stop', 'update'] as $mode) {
      $sf = '/boot/config/plugins/user.scripts/scripts/unraid-docker-orchestrator-' . $mode . '/script';
      if (file_exists($sf)) { $staleScripts[] = $mode; }
    }
  }

  return [
    'success'      => true,
    'stale'        => count($staleScripts) > 0,
    'stale_scripts'=> $staleScripts,
    'saved_at'     => $savedAt,
    'scripts'      => $scripts,
  ];
}
