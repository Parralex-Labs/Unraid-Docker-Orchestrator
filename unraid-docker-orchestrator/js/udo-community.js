/**
 * UDO - Couche communautaire de healthchecks
 * Parralex-Labs · GNU General Public License v3
 *
 * Ce fichier prépare le terrain pour la bibliothèque communautaire de
 * healthchecks. Il est chargé après udo-classify.js mais ne fait rien
 * de visible pour l'instant.
 *
 * Architecture cible :
 *
 *   GitHub (udo-community-presets/)
 *     └── presets/<image>.json      ← contributions communautaires
 *
 *   Cloudflare Worker
 *     ├── POST /vote                ← soumettre un vote (fingerprint anonyme)
 *     └── GET  /votes               ← lire les scores agrégés
 *
 *   /boot/config/plugins/udo/community-presets/
 *     ├── <image>.json              ← presets téléchargés localement
 *     └── scores.json               ← scores récupérés du Worker
 *
 *   Cascade getPresetCmd() (udo-classify.js) :
 *     1. Custom utilisateur (settings → services)
 *     2. Preset communautaire sélectionné (UDO_COMMUNITY_PRESETS)   ← ce fichier
 *     3. HEALTHCHECK_PRESETS intégrés (udo-healthchecks.js)
 *     4. Détection automatique (hc_native, webui_port, env vars, fallback nc)
 *
 * Chargement : après udo-classify.js (voir UDO.page)
 */

// ── État local ─────────────────────────────────────────────────────────────
// Presets communautaires chargés depuis /boot via PHP → UDO_CONFIG
// Format : { 'jellyfin': [ { id, cmd, level, description, score }, ... ] }
var communityPresets = (window.UDO_COMMUNITY_PRESETS) ? window.UDO_COMMUNITY_PRESETS : {};

// Sélections de l'utilisateur : { 'jellyfin': 'jellyfin-health-001' }
var communitySelections = (window.UDO_CONFIG && window.UDO_CONFIG.communitySelections)
  ? window.UDO_CONFIG.communitySelections
  : {};

// ── API publique ────────────────────────────────────────────────────────────

/**
 * Retourne la commande healthcheck communautaire pour une image donnée.
 * Utilisé par getPresetCmd() comme couche prioritaire 2.
 *
 * @param  {string} imageName     - nom d'image normalisé (ex: 'jellyfin')
 * @param  {string} containerName - nom du container (ex: 'jellyfin')
 * @returns {string|null} commande bash ou null si aucun preset communautaire
 */
function getCommunityPresetCmd(imageName, containerName) {
  // STUB — retourne null tant que la feature n'est pas activée
  // Implémentation future :
  //   1. Résoudre la clé image depuis imageName/containerName
  //   2. Lire communitySelections[key] pour trouver l'id sélectionné
  //   3. Chercher dans communityPresets[key] le preset avec cet id
  //   4. Retourner preset.cmd ou null
  return null;
}

/**
 * Télécharge les presets communautaires pour les images présentes
 * dans la configuration actuelle. Stocke dans community-presets/ sur /boot.
 * Appelle ajax.php → fetch_community_presets.
 *
 * @param {function} [callback] - appelé avec (success, error)
 */
function fetchCommunityPresets(callback) {
  // STUB — no-op pour l'instant
  // Implémentation future :
  //   1. Collecter les noms d'images depuis importedImages
  //   2. Appeler udoFetch('fetch_community_presets', { images: [...] })
  //   3. Le PHP télécharge depuis GitHub raw + scores depuis le Worker
  //   4. Met à jour communityPresets + communitySelections en mémoire
  //   5. Appeler callback(true) ou callback(false, err)
  if (typeof callback === 'function') callback(false, 'stub');
}

/**
 * Soumet un vote pour un preset communautaire.
 * Appelle le Cloudflare Worker POST /vote.
 *
 * @param {string}   presetId  - identifiant unique du preset (ex: 'jellyfin-health-001')
 * @param {number}   direction - +1 (upvote) ou -1 (downvote)
 * @param {function} [callback]
 */
function votePreset(presetId, direction, callback) {
  // STUB — no-op pour l'instant
  // Implémentation future :
  //   1. Générer un fingerprint anonyme (hash local sans données personnelles)
  //   2. Appeler udoFetch('submit_vote', { preset_id, direction, fingerprint })
  //   3. Le PHP relaye vers le Cloudflare Worker POST /vote
  //   4. Mettre à jour le score local en mémoire
  //   5. Appeler callback(true) ou callback(false, err)
  if (typeof callback === 'function') callback(false, 'stub');
}

/**
 * Sélectionne un preset communautaire comme healthcheck actif pour un container.
 * Persiste dans communitySelections via save_config.
 *
 * @param {string} containerName - nom du container
 * @param {string} presetId      - id du preset choisi
 */
function selectCommunityPreset(containerName, presetId) {
  // STUB — no-op pour l'instant
  // Implémentation future :
  //   1. communitySelections[containerName] = presetId
  //   2. Sauvegarder dans config.json via udoFetch('save_config', ...)
  //   3. Invalider le checkCmd actuel du container pour forcer re-détection
  //   4. render() pour rafraîchir l'UI
}

/**
 * Ouvre la modale de sélection communautaire pour un container.
 * Affiche les propositions disponibles, leurs scores, et permet vote + sélection.
 *
 * @param {string} containerName - nom du container
 * @param {string} imageName     - nom d'image normalisé
 */
function openCommunityModal(containerName, imageName) {
  // STUB — no-op pour l'instant
  // Implémentation future :
  //   1. S'assurer que communityPresets[imageName] est chargé
  //      (fetchCommunityPresets si nécessaire)
  //   2. Construire la modale avec la liste des presets triés par score
  //   3. Pour chaque preset : cmd, level, description, score, 👍👎, bouton Utiliser
  //   4. Brancher votePreset() et selectCommunityPreset() sur les boutons
}
