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

'use strict';

var TRANSLATIONS = {
  fr: {
    subtitle:           "// Générateur de script UserScript — ordre de démarrage des conteneurs",
    section_import:     "Import docker ps",
    section_pool:       "Conteneurs non assignés",
    section_groups:     "Groupes & ordre de démarrage",
    section_generate:   "Generer",
    btn_import:         "Importer",

  btn_import_docker:     "Importer depuis Docker",
  btn_reset: "Réinitialiser",
    reset_confirm: "Réinitialiser toute la session ? Cette action effacera groupes, conteneurs et pool.",
    btn_export: "Exporter la config",
    js_script_title:    "# Unraid - Démarrage ordonné des conteneurs Docker",
    js_script_generated:function(d) { return "# Genere le " + d + " via Unraid Docker Script Generator"; },
    js_script_trigger:  "# Declencheur : \"At Startup of Array\" dans User Scripts",
    js_script_start_log:"echo \"$(date) - === Demarrage ===" + " \" > \"$LOG\"",
    js_script_wait_log: "    echo \"$(date) - Attente : $name (max ${timeout}s)\" | tee -a \"$LOG\"",
    js_script_wait_timeout: "TIMEOUT :",
    js_script_end_log:  "echo \"$(date) - === Sequence terminee ===" + " \" | tee -a \"$LOG\"",
    js_script_disabled: "# DESACTIVE : ",
    js_script_docker_wait_title: "# Vérification disponibilité Docker",
    js_script_docker_wait_log: 'echo "$(date) - Attente de Docker..." | tee -a "$LOG"',
    js_script_docker_ok: 'Docker prêt',
    js_script_docker_timeout: 'ERREUR : Docker non disponible après 120s — arrêt',
    js_script_abort_comment: 'Mettre à 1 pour arrêter si un wait_for timeout',
    hc_level_good:  '🟢 Test auto configuré',
    hc_level_basic: '🟡 Test de port détecté',
    hc_level_none:  '🔴 Aucun test — attente running',
    hc_edit_title:  'Modifier la commande de test',
    hc_auto_btn:    'Détecter auto',
    hc_close_btn:   'Fermer',
    hc_comment_good:  'Test fiable',
    hc_comment_basic: 'Test basique (port)',
    hc_comment_none:  'Aucun test — attente running',
    placeholder_check_cmd: 'ex: redis-cli ping | grep -q PONG',
    btn_copy_script:       'Copier',
    label_dry_run:         '🔍 Dry-run — simuler sans modifier (pull pour détecter, pas de stop/rm/run)',
    js_copy_ok:            '✓ Copié',
    js_update_prune: 'Nettoyage des images obsolètes...',
    js_update_prune_skip: 'Images conservées (option activée)',
    js_script_boot_delay_comment: 'Délai en secondes avant de démarrer les conteneurs',
    label_parallel: '∥ Parallèle',
    btn_collapse_all: '⊟ Tout replier',
    btn_expand_all: '⊞ Tout déplier',
    btn_collapse: '▼ Replier',
    btn_expand: '▶ Déplier',
    dep_detected: 'dépendance(s) détectée(s)',
    dep_accepted: 'acceptée(s)',
    dep_ignored: 'ignorée(s)',
    msg_analyze_required: 'Import complet chargé — cliquez sur 🔍 Analyser les dépendances avant de Classifier.',
    msg_analyze_done: 'Analyse terminée — vous pouvez maintenant Classifier.',
    parallel_suggest: 'Ce groupe peut être parallélisé',
    parallel_activate: 'Activer',
    parallel_active_label: 'Mode parallèle actif',
    parallel_deactivate: 'Désactiver',
    js_script_log_summary: 'LOG COMPLET DU DÉMARRAGE',
    js_script_log_url: 'Log consultable ici :',
    js_script_parallel_wait: 'Attente fin du groupe parallèle',
    js_script_boot_delay_waiting: 'Attente',
    label_boot_delay: '⏱ Délai avant démarrage du Script (secondes)',
    settings_saved: 'Sauvegardé',
    settings_general: 'Démarrage général',
    settings_group_pauses: 'Pauses entre groupes',
    settings_docker_timeout: 'Timeout attente Docker',
    settings_add_service: 'Ajouter un service',
    settings_add_service_prompt: 'Nom du service (ex: mon-app)',
    settings_reset_confirm: 'Réinitialiser aux valeurs par défaut ?',
    col_service: 'Service',
    col_check_cmd: 'Commande de test',
    label_boot_delay_short: 'Boot delay (avant démarrage)',
    pause_hint_vpn: 'laisser le VPN s\'établir',
    pause_hint_db: 'BDD initialisées via wait_for',
    pause_hint_media: 'parallèle, pas de pause nécessaire',
    pause_hint_dns: 'pas de wait_for',
    js_script_abort_msg: 'ARRÊT : timeout sur',
    js_script_skip_dep: 'IGNORÉ : dépendance non prête pour',
    js_script_dep_not_ready: 'dépendance non prête',
    dep_vpn_via: "route son trafic via",
    dep_must_start: "doit démarrer en premier",
    dep_accept_btn: "✓ Accepter",
    dep_ignore_btn: "Ignorer",
    dep_must_after: "doit démarrer après",
    dep_db_connects: "se connecte à la base de données",
    dep_proxy_exposed: "est exposé derrière le proxy",
    dep_vol_share: "partagent le volume",
    dep_depends: "dépend de",
    dep_variable: "variable env",
    dep_label: "label",
    stat_analyzed: "conteneurs analysés —",
    stat_added_pool: "conteneur(s) ajouté(s) au pool",
    stat_deps_applied: "dépendance(s) appliquée(s)",
    stat_reordered: "groupes réordonnés",
    stat_wait_active: "✓ wait_for activé sur",
    dep_no_deps: "Aucune dépendance détectée.",
    dep_gpu_uses:       "utilise le GPU (transcodage hardware)",
    dep_gpu_driver:     "assurez-vous que le driver GPU est chargé avant ce conteneur",
    dep_mqtt_connects:  "se connecte au broker MQTT",
    dep_auth_depends:   "est protégé par le service d'authentification",
    dep_healthcheck_info: "possède un healthcheck — le script attendra l'état 'healthy' avant de continuer",
    dep_no_graph: "Aucune dépendance à afficher",
    inspect_loaded: "{n} conteneurs chargés — données locales uniquement",
    js_classify_required: "Veuillez d'abord classifier les conteneurs.",
  cron_disabled: "Cron désactivé",
  autostart_err: "Erreur autostart",
  autostart_saved: "Démarrage automatique configuré",
  manual_import_source: "Source (JSON docker inspect)",
  prompt_group_name: "Nom du groupe :",
  prompt_dep_name: "Dépend de (nom du conteneur) :",
  col_timeout: "Timeout (s)",
  confirm_run: "Exécuter le script maintenant ?",
  status_reset: "Session réinitialisée",
  status_ready: "Prêt",
  status_importing: "Import en cours...",
  error_no_script: "Générez d'abord un script",
  js_wait_for_active: "wait_for actif",
  js_test_timeout: "Timeout test (s)",
  js_container_placeholder: "Deposez vos conteneurs ici",
  js_enabled_label: "Actif",
  js_wait_for_label: "Attendre healthcheck",
  js_pause_label: "Pause après ce groupe",
	js_appfeed_search: "Recherche de l'AppFeed...",
    js_appfeed_dl: "Téléchargement de l'AppFeed...",
    js_appfeed_err: function(e) { return "Erreur: " + e; },
    js_appfeed_cached: function(n, age) { return n + " apps (en cache " + age + ")"; },
    js_appfeed_local: function(n) { return n + " apps (fichier local)"; },
    js_appfeed_github: function(n) { return n + " apps (téléchargées)"; },
    js_appfeed_nocache: function(n) { return n + " apps (sans cache)"; },
    js_appfeed_count: function(af, r) { return "Classé via AppFeed : " + af + " | Règles internes : " + r; },
    js_appfeed_norules: function(r) { return "Classé via règles internes : " + r; },
    js_appfeed_warn: "Attention : AppFeed non chargé.",
    js_classify_done: "Classification terminée :",
    js_added: function(n) { return n + " conteneur(s) ajouté(s)"; },
    js_pool_empty: "Aucun conteneur dans le pool",
    js_unclassified: "Non classés",
    js_cache_clear: "Vidage du cache...",
    js_cache_err: "Erreur lors du vidage du cache",
    js_appfeed_notready: "AppFeed en cours de chargement...",
    js_appfeed_ready: "AppFeed prêt à être utilisé",
    // Nouveaux onglets
    tab_start: "🚀 Démarrage",
    tab_stop: "🛑 Arrêt",
    tab_update: "🔄 Mise à jour",
    section_classify: 'Classification',
    section_deps: 'Dépendances',
    section_cron: 'Planification automatique',
    btn_save_settings: 'Sauvegarder',
    help_btn_title: "Guide d'utilisation",
    help_guide: `Guide d'utilisation Unraid Docker Orchestrator

1. IMPORTER vos conteneurs
   Cliquez sur « Importer depuis Docker » pour charger automatiquement tous vos conteneurs depuis le démon Docker.

2. CLASSER vos conteneurs
   Cliquez sur « Classer automatiquement » — le plugin détecte les groupes logiques (BDD, Proxy, IA…) et les ordonne intelligemment.

3. AJUSTER l'ordre
   Glissez-déposez les groupes entiers (par le header) ou les conteneurs dans les groupes.
   Activez le mode parallèle sur les groupes indépendants pour accélérer le démarrage.

4. CONFIGURER les dépendances
   Le panneau « Dépendances » affiche les liens détectés (volumes partagés, réseaux, healthchecks).
   Activez wait_for sur les conteneurs critiques pour attendre qu'ils soient prêts.

5. GÉNÉRER les scripts
   Cliquez sur « Générer » pour obtenir 3 scripts : Démarrage, Arrêt, Mise à jour.
   Copiez-les dans Unraid User Scripts avec le déclencheur « At Startup of Array ».

6. LICENCE
   Unraid Docker Orchestrator — Copyright (C) 2026 Parralex-Labs
   Distribue sous licence GNU General Public License v3.0
   https://github.com/Parralex-Labs/Unraid-Docker-Orchestrator`,
  
    btn_json_manual: 'JSON manuel',
    btn_auto_classify: 'Auto-classifier',
    placeholder_inspect: 'Coller le résultat de docker inspect ici...',
    msg_empty_start: 'Cliquez sur "Importer depuis Docker" pour commencer',
    btn_simulate: "⏱ Simuler",
    btn_add_group: 'Groupe',
    sim_title: "⏱ Simulation démarrage",
    label_keep_images: 'Conserver les images',
    label_protect_db: 'Protéger images BDD',
    btn_generate: 'Générer le script',
    btn_install: 'Installer dans User Scripts',
    btn_run_now: 'Exécuter maintenant',
    section_exec_log: "Sortie d'exécution",
    cron_update_title: "🔄 Mise à jour automatique",
    cron_weekly_sun: 'Chaque dimanche à 4h',
    cron_weekly_mon: 'Chaque lundi à 4h',
    cron_monthly: '1er du mois à 3h',
    cron_custom: 'Personnalisé...',
    cron_status_title: "📊 Statut",
    cron_update_label: 'Update :',
    cron_inactive: 'Désactivé',
  
    js_script_absent: 'ABSENT $name — ignoré',
    js_script_flock_start: 'Script start déjà en cours — abandon',
    js_script_flock_stop: 'Script stop déjà en cours — abandon',
    js_script_flock_update: 'Script update déjà en cours — abandon',
    js_script_err_line: 'ERREUR ligne $LINENO',
    js_script_warn_start: 'WARN: échec démarrage $name',
    js_script_comment_nbsp: "Nettoyage préventif des NBSP (U+00A0) pouvant venir d'un copier-coller navigateur",
    js_script_comment_flock: 'Protection anti double-exécution (flock)',
    js_script_comment_parallel: 'Lancement parallèle avec log individuel',
    js_script_comment_stop_parallel: 'Arrêt parallèle avec log individuel',
    js_script_comment_stop_ordered: "Script d'arrêt ordonné des conteneurs",
    js_script_comment_wait_docker: 'Attente que Docker soit disponible',
    js_script_comment_resolve_port: 'Résout le port hôte mappé depuis un port container donné',
    js_script_comment_test_host: "Teste depuis l'hôte en résolvant le HostPort pour un port container donné",
    js_update_section_ip: 'Récupération IP et URL du log',
  
  
    app_title: 'Unraid Docker Orchestrator',
  
    col_active: 'Actif',
    col_container: 'Conteneur',
    col_hc_test: 'Test santé',
  
    js_script_comment_resolve_ports: 'Résoudre les ports: HostConfig.PortBindings (toujours dispo) + NetworkSettings.Ports (runtime)',
    js_script_comment_portbindings: 'PortBindings: disponible même conteneur arrêté',
    js_script_comment_netsports: 'Complète avec NetworkSettings.Ports si running',
    js_script_comment_static_cache: 'Cache champs statiques (calculé une seule fois)',
    js_script_comment_exec1: 'Essai 1 : docker exec dans le conteneur',
    js_script_comment_exec2: "Essai 2 : nc -z sur HostPorts depuis l'hôte (bridge standard)",
    js_script_comment_exec3: 'Essai 3 : nc -z sur IP conteneur (macvlan/br0)',
    js_script_comment_ep_cache: 'utilisé depuis le cache',
    js_script_comment_fallback_running: 'Fallback : running 10s sans port accessible (réseau isolé)',
    js_script_comment_sleep_adaptive: 'Sleep adaptatif : 1s les 10 premières secondes, 2s ensuite',
    js_script_comment_vpn_detect: 'Détection automatique parent VPN (NetworkMode: container:X)',
    js_script_comment_absent: 'conteneur absent : non fatal',
  
    js_script_comment_already_stopped: 'SKIP $name (déjà arrêté)',
    js_update_summary_msg: 'conteneur(s) mis à jour :',
  
    col_seconds: 'secondes',
    hint_drop: 'Déposez vos conteneurs ici',
    lbl_container_count: 'conteneur',
    lbl_containers_count: 'conteneurs',
    lbl_active: 'actifs',
    lbl_active_count: 'actif',
    placeholder_cname: 'nom-du-conteneur',
    parallel_label: 'Parallèle',
    export_config: 'Export',
    msg_importing: 'Import en cours...',
    msg_import_ok: 'conteneurs importés',
    msg_no_containers: 'Aucun conteneur importé',
    msg_ready: 'Prêt — importez vos conteneurs',
    msg_no_script: 'Aucun script à copier',
    script_title_start: 'UDO - Démarrage ordonné des conteneurs Docker',
    script_title_stop: 'UDO - Arrêt ordonné des conteneurs Docker',
    script_title_update: 'UDO - Mise à jour des conteneurs Docker',
    msg_err_import: 'Erreur import: ',
    msg_err_parse: 'Erreur parse: ',
    msg_err_network: 'Erreur réseau: ',
    msg_err_install: 'Erreur install: ',
    msg_err_containers: 'Impossible de charger la liste des conteneurs.',
    lbl_actifs: 'actifs',
    col_wait_for: 'wait_for',
  
    section_config: 'Configuration',
  
    hint_drop_ignored: 'Toutes ignorées',
    prompt_group_name2: 'Nom du groupe',
    btn_add_manual: '+ ajouter manuellement',
    lbl_stack_compose: 'Stack compose: ',
    dep_no_dep_free: 'Aucune dépendance - démarre librement',
    dep_free_badge: '⊘ libre',
    dep_add_btn: 'Ajouter une dépendance',
    dep_manual_from: "Activé manuellement par l'utilisateur",
    lbl_db_group: 'Base de données',
    dep_detected_label: 'Dépendance détectée : ',
    sim_estimated: 'Temps estimé : ~',
    lbl_unsaved: '● Non sauvegardé',
    dep_vol_access: ' accède aux données de ',
    dep_net_share: ' partage le réseau ',
  
    js_pause_label: 'Pause après ce groupe',
  
    lbl_boot_delay: '⏱ Boot delay',
    lbl_seconds_unit: 's',
    lbl_abort_fail: '🛑 Arrêt si échec',
  
    btn_delete: 'Supprimer',
    btn_collapse_group: 'Replier ce groupe',
    btn_expand_all2: 'Tout déplier',
    lbl_parallel_mode: '∥ Parallèle',
    lbl_dep_link: '🔗 Dépendance',
    lbl_auto_rule: '⚙️ Règle auto',
    lbl_new_group: 'Nouveau Groupe',
    msg_min_one_group: 'Il faut au moins un groupe.',
    msg_analyze_done2: 'Analyse terminée — vous pouvez maintenant Classifier.',
    settings_docker_timeout2: 'Timeout attente Docker',
    pause_hint_db2: 'BDD initialisées via wait_for',
    pause_hint_media2: 'parallèle, pas de pause nécessaire',
    reset_rules_confirm: 'Réinitialiser toutes les règles de services ?',
    reset_pauses_confirm: 'Réinitialiser les pauses aux valeurs par défaut ?',
    reset_session_confirm: 'Réinitialiser toute la session ?',
    msg_session_reset: 'Session réinitialisée',
    msg_config_imported: 'Config importée',
    msg_err_generic: 'Erreur: ',
    prompt_group_name3: 'Nom du groupe :',
    msg_groups_loaded: 'groupes chargés depuis la configuration',
    appfeed_unavailable: 'AppFeed indisponible — règles intégrées utilisées',
    preset_hc_detected: 'Preset healthcheck détecté',
  
  
    toggle_wait_for_on: 'wait_for activé : attendre que ce conteneur soit prêt avant de continuer',
    toggle_wait_for_off: 'wait_for désactivé : démarrer sans attendre',
    toggle_enabled_on: 'Conteneur actif : sera démarré',
    toggle_enabled_off: 'Conteneur désactivé : sera ignoré au démarrage',
    timeout_hint: "Délai max d'attente en secondes (wait_for)",
    hc_auto_hint: 'Cliquer pour activer/éditer la commande de test healthcheck',
    hc_why_not_auto: "Le healthcheck auto s'active uniquement sur les conteneurs avec wait_for=ON et un preset détecté",
  
    group_vpn_reseau: 'VPN / Réseau',
    group_bases_de_donnees: 'Bases de données',
    group_proxy_ssl: 'Proxy & SSL',
    group_ia_llm: 'IA & LLM',
    group_applications_web: 'Applications web',
    group_monitoring: 'Monitoring',
    group_serveurs_media: 'Serveurs média',
    group_gestion_medias: 'Gestion médias',
    group_telechargement: 'Téléchargement',
    group_fichiers_sync: 'Fichiers & Sync',
    group_outils: 'Outils',
    group_dns_adblock: 'DNS & AdBlock',
    group_auth: 'Auth',
    group_domotique: 'Domotique',
  
    js_script_pause_group: 'pause après groupe',
    js_update_detection2: 'Détection des mises à jour',
    js_update_none_available: 'Aucune mise à jour disponible',
  
  
    js_script_generated_on: '# Généré le ',
  
    js_script_dedup_skip: '# DOUBLON ignoré — déjà généré précédemment :',
  
    settings_disabled_title: 'Containers désactivés par défaut',
    settings_disabled_hint: 'Ces containers seront ajoutés avec enabled=OFF lors de la classification automatique.',
    settings_disabled_placeholder: 'nom-du-container',
    settings_disabled_add: '+ Ajouter',
    settings_disabled_empty: 'Aucun container désactivé par défaut',
  
    msg_already_assigned: 'Ce container est déjà dans un autre groupe',
  
  
    js_script_title_update: '# Unraid - Mise à jour des conteneurs Docker',
    js_update_section_start: 'Démarrage Mise à Jour',
  
    import_config: 'Erreur import config',
  
    btn_save: 'Sauvegarder',
    btn_copy: 'Copier',
  
  
  
  
    msg_config_saved: '✓ Configuration sauvegardée',
  
    cron_select_days: 'Sélectionnez un jour',
  
    cron_preview_daily: 'Tous les jours',
  
    cron_day_sun: 'Dim',
  
    cron_day_sat: 'Sam',
  
    cron_day_fri: 'Ven',
  
    cron_day_thu: 'Jeu',
  
    cron_day_wed: 'Mer',
  
    cron_day_tue: 'Mar',
  
    cron_day_mon: 'Lun',
  
    cron_weekly: 'Certains jours',
  
    cron_daily: 'Tous les jours',
  
    cron_lbl_hour: 'Heure',
  
    cron_lbl_days: 'Jours',
  
    cron_lbl_freq: 'Fréquence',
  
    cron_at_stopping: "À l'arrêt du serveur",
  
    cron_at_startup: 'Au démarrage du serveur',
  
    cron_stop_title: 'Arrêt',
  
    cron_start_title: 'Démarrage',
  
    msg_cron_saved_us: '✓ Planification sauvegardée — rechargez User Scripts pour voir le changement',
  
    dep_warn_same_group: '⚠ Placé avant {dep} (même groupe)',
  
    dep_warn_same_group_short: 'même groupe',
  
    dep_warn_diff_group: '⚠ Placé avant {dep} (groupe : {grp})',
  
    dep_warn_confirm: 'Des dépendances semblent dans le mauvais ordre :',
  
    dep_warn_confirm_q: 'Générer le script quand même ?',
  
    drift_title: 'Scripts potentiellement obsolètes — la configuration a changé depuis la dernière génération',
  
    drift_added: '+ Nouveaux',
  
    drift_removed: '- Supprimés',
  
    drift_ok: '✓ Scripts à jour — aucun changement détecté',
  
    btn_check_drift: '🔄 Vérifier',
  
    drift_scripts: 'Scripts concernés',
  
    js_script_log_summary_update: 'LOG COMPLET DE LA MISE A JOUR',
  },
  en: {
    subtitle:           "// UserScript generator — container startup order",
    section_import:     "Import docker ps",
    section_pool:       "Unassigned containers",
    section_groups:     "Groups & startup order",
    section_generate:   "Generate",
    btn_import:         "Import",

  btn_import_docker:     "Import from Docker",
  btn_reset: "Reset",
    reset_confirm: "Reset the entire session? This will clear all groups, containers and pool.",
    btn_export: "Export config",
    js_script_title:    "# Unraid - Ordered Docker container startup",
    js_script_generated:function(d) { return "# Generated on " + d + " via Unraid Docker Script Generator"; },
    js_script_trigger:  "# Trigger: \"At Startup of Array\" in User Scripts",
    js_script_start_log:"echo \"$(date) - === Starting ===" + " \" > \"$LOG\"",
    js_script_wait_log: "    echo \"$(date) - Waiting: $name (max ${timeout}s)\" | tee -a \"$LOG\"",
    js_script_wait_timeout: "TIMEOUT:",
    js_script_end_log:  "echo \"$(date) - === Sequence complete ===" + " \" | tee -a \"$LOG\"",
    js_script_disabled: "# DISABLED: ",
    js_script_docker_wait_title: "# Checking Docker availability",
    js_script_docker_wait_log: 'echo "$(date) - Waiting for Docker..." | tee -a "$LOG"',
    js_script_docker_ok: 'Docker ready',
    js_script_docker_timeout: 'ERROR: Docker not available after 120s — aborting',
    js_script_abort_comment: 'Set to 1 to abort if a wait_for times out',
    hc_level_good:  '🟢 Auto test configured',
    hc_level_basic: '🟡 Port test detected',
    hc_level_none:  '🔴 No test — waiting for running',
    hc_edit_title:  'Edit health test command',
    hc_auto_btn:    'Auto detect',
    hc_close_btn:   'Close',
    hc_comment_good:  'Reliable test',
    hc_comment_basic: 'Basic test (port)',
    hc_comment_none:  'No test — waiting for running',
    placeholder_check_cmd: 'e.g. redis-cli ping | grep -q PONG',
    js_copy_ok:            '✓ Copied',
    js_update_prune: 'Cleaning up obsolete images...',
    js_update_prune_skip: 'Images kept (option enabled)',
    label_boot_delay: '⏱ Delay before Script startup (seconds)',
    settings_saved: 'Saved',
    settings_general: 'General startup',
    settings_group_pauses: 'Pauses between groups',
    settings_docker_timeout: 'Docker wait timeout',
    settings_add_service: 'Add a service',
    settings_add_service_prompt: 'Service name (e.g. my-app)',
    settings_reset_confirm: 'Reset to default values?',
    col_service: 'Service',
    col_check_cmd: 'Test command',
    label_boot_delay_short: 'Boot delay (before startup)',
    pause_hint_vpn: 'let VPN establish',
    pause_hint_db: 'DB initialized via wait_for',
    pause_hint_media: 'parallel, no pause needed',
    pause_hint_dns: 'no wait_for',
    js_script_boot_delay_comment: 'Delay in seconds before starting containers',
    label_parallel: '∥ Parallel',
    js_script_parallel_wait: 'Waiting for parallel group to finish',
    btn_collapse_all: '⊟ Collapse all',
    btn_expand_all: '⊞ Expand all',
    btn_collapse: '▼ Collapse',
    btn_expand: '▶ Expand',
    dep_detected: 'dependency(ies) detected',
    dep_accepted: 'accepted',
    dep_ignored: 'ignored',
    msg_analyze_required: 'Full import loaded — click 🔍 Analyze dependencies before classifying.',
    msg_analyze_done: 'Analysis done — you can now Classify.',
    parallel_suggest: 'This group can be parallelized',
    parallel_activate: 'Enable',
    parallel_active_label: 'Parallel mode active',
    parallel_deactivate: 'Disable',
    js_script_log_summary: 'FULL STARTUP LOG',
    js_script_log_url: 'Log available at:',
    js_script_boot_delay_waiting: 'Waiting',
    js_script_abort_msg: 'ABORT: timeout on',
    js_script_skip_dep: 'SKIPPED: dependency not ready for',
    js_script_dep_not_ready: 'dependency not ready',
    dep_vpn_via: "routes its traffic through",
    dep_must_start: "must start first",
    dep_accept_btn: "✓ Accept",
    dep_ignore_btn: "Ignore",
    dep_must_after: "must start after",
    dep_db_connects: "connects to database",
    dep_proxy_exposed: "is exposed behind proxy",
    dep_vol_share: "share volume",
    dep_depends: "depends on",
    dep_variable: "env variable",
    dep_label: "label",
    stat_analyzed: "containers analyzed —",
    stat_added_pool: "container(s) added to pool",
    stat_deps_applied: "dependency(ies) applied",
    stat_reordered: "groups reordered",
    stat_wait_active: "✓ wait_for enabled on",
    dep_no_deps: "No dependency detected.",
    dep_gpu_uses:       "uses the GPU (hardware transcoding)",
    dep_gpu_driver:     "make sure the GPU driver is loaded before this container",
    dep_mqtt_connects:  "connects to the MQTT broker",
    dep_auth_depends:   "is protected by the authentication service",
    dep_healthcheck_info: "has a healthcheck — the script will wait for 'healthy' state before continuing",
    dep_no_graph: "No dependency to display",
    inspect_loaded: "{n} containers loaded — local data only",
    js_classify_required: "Please classify containers first.",
  cron_disabled: "Cron disabled",
  autostart_err: "Autostart error",
  autostart_saved: "Autostart configured",
  manual_import_source: "Source (JSON docker inspect)",
  prompt_group_name: "Group name:",
  col_timeout: "Timeout (s)",
  confirm_run: "Run the script now?",
  status_reset: "Session reset",
  status_ready: "Ready",
  status_importing: "Importing...",
  error_no_script: "Generate a script first",
    js_added: function(n) { return n + " container(s) added"; },
    js_appfeed_cached: function(n, age) { return n + " apps (cached " + age + ")"; },
    js_appfeed_count: function(af, r) { return "Classified via AppFeed: " + af + " | Built-in rules: " + r; },
    js_appfeed_dl: "Downloading AppFeed...",
    js_appfeed_err: function(e) { return "Error: " + e; },
    js_appfeed_github: function(n) { return n + " apps (downloaded)"; },
    js_appfeed_local: function(n) { return n + " apps (local file)"; },
    js_appfeed_nocache: function(n) { return n + " apps (no cache)"; },
    js_appfeed_norules: function(r) { return "Classified via built-in rules: " + r; },
    js_appfeed_notready: "AppFeed loading...",
    js_appfeed_ready: "AppFeed ready",
    js_appfeed_warn: "Warning: AppFeed not loaded.",
    js_cache_clear: "Clearing cache...",
    js_cache_err: "Error clearing cache",
    js_classify_done: "Classification complete:",
    js_pool_empty: "No containers in pool",
    js_unclassified: "Unclassified",
    btn_copy_script: "Copy",
    label_dry_run:         '🔍 Dry-run — simulate without modifying (pull to detect, no stop/rm/run)',
    section_config: "Configuration",
    js_appfeed_search: "Searching local AppFeed...",
    tab_start: "🚀 Start",
    tab_stop: "🛑 Stop",
    tab_update: "🔄 Update",
    help_guide: `Unraid Docker Orchestrator User Guide

1. IMPORT your containers
   Click "Import from Docker" to automatically load all your containers from the Docker daemon.

2. CLASSIFY your containers
   Click "Auto-classify" — the plugin detects logical groups (DB, Proxy, AI…) and orders them intelligently.

3. ADJUST the order
   Drag and drop entire groups (by the header) or containers within groups.
   Enable parallel mode on independent groups to speed up startup.

4. CONFIGURE dependencies
   The "Dependencies" panel shows detected links (shared volumes, networks, healthchecks).
   Enable wait_for on critical containers to wait until they are ready.

5. GENERATE scripts
   Click "Generate" to get 3 scripts: Start, Stop, Update.
   Copy them into Unraid User Scripts with the "At Startup of Array" trigger.

5. GENERATE scripts
   Click "Generate" to get 3 scripts: Start, Stop, Update.
   Copy them into Unraid User Scripts with the "At Startup of Array" trigger.

6. LICENSE
   Unraid Docker Orchestrator — Copyright (C) 2026 Parralex-Labs
   Distributed under the GNU General Public License v3.0
   https://github.com/Parralex-Labs/Unraid-Docker-Orchestrator`,
  
    btn_json_manual: 'Manual JSON',
    btn_auto_classify: 'Auto-classify',
    placeholder_inspect: 'Paste docker inspect output here...',
    msg_empty_start: 'Click "Import from Docker" to get started',
    btn_simulate: "⏱ Simulate",
    btn_add_group: 'Group',
    sim_title: "⏱ Startup simulation",
    label_keep_images: 'Keep old images',
    label_protect_db: 'Protect DB images',
    btn_generate: 'Generate script',
    btn_install: 'Install in User Scripts',
    btn_run_now: 'Run now',
    section_exec_log: 'Execution output',
    cron_update_title: "🔄 Automatic update",
    cron_weekly_sun: 'Every Sunday at 4am',
    cron_weekly_mon: 'Every Monday at 4am',
    cron_monthly: '1st of month at 3am',
    cron_custom: 'Custom...',
    cron_status_title: "📊 Status",
    cron_update_label: 'Update:',
    cron_inactive: 'Disabled',
  
    js_script_absent: 'ABSENT $name — skipped',
    js_script_flock_start: 'Start script already running — abort',
    js_script_flock_stop: 'Stop script already running — abort',
    js_script_flock_update: 'Update script already running — abort',
    js_script_err_line: 'ERROR line $LINENO',
    js_script_warn_start: 'WARN: start failed $name',
    js_script_comment_nbsp: 'Preventive cleanup of NBSP (U+00A0) from browser copy-paste',
    js_script_comment_flock: 'Double-execution protection (flock)',
    js_script_comment_parallel: 'Parallel launch with individual log',
    js_script_comment_stop_parallel: 'Parallel stop with individual log',
    js_script_comment_stop_ordered: 'Ordered container stop script',
    js_script_comment_wait_docker: 'Waiting for Docker to be available',
    js_script_comment_resolve_port: 'Resolves the host port mapped from a given container port',
    js_script_comment_test_host: 'Tests from host by resolving HostPort for a given container port',
    js_update_section_ip: 'IP and log URL retrieval',
  
  
    app_title: 'Unraid Docker Orchestrator',
  
    col_active: 'Active',
    col_container: 'Container',
    col_hc_test: 'Health test',
    js_pause_label: 'Pause after group',
    prompt_dep_name: 'Dependency name',
  
    js_script_comment_resolve_ports: 'Resolve ports: HostConfig.PortBindings (always available) + NetworkSettings.Ports (runtime)',
    js_script_comment_portbindings: 'PortBindings: available even when container is stopped',
    js_script_comment_netsports: 'Complete with NetworkSettings.Ports if running',
    js_script_comment_static_cache: 'Cache static fields (computed once)',
    js_script_comment_exec1: 'Try 1: docker exec inside the container',
    js_script_comment_exec2: 'Try 2: nc -z on HostPorts from host (standard bridge)',
    js_script_comment_exec3: 'Try 3: nc -z on container IP (macvlan/br0)',
    js_script_comment_ep_cache: 'used from cache',
    js_script_comment_fallback_running: 'Fallback: running 10s without accessible port (isolated network)',
    js_script_comment_sleep_adaptive: 'Adaptive sleep: 1s for first 10 seconds, 2s after',
    js_script_comment_vpn_detect: 'Automatic VPN parent detection (NetworkMode: container:X)',
    js_script_comment_absent: 'container absent: non-fatal',
  
    js_script_comment_already_stopped: 'SKIP $name (already stopped)',
    js_update_summary_msg: 'container(s) updated:',
  
    col_seconds: 'seconds',
    hint_drop: 'Drop containers here',
    lbl_container_count: 'container',
    lbl_containers_count: 'containers',
    lbl_active: 'active',
    lbl_active_count: 'active',
    placeholder_cname: 'container-name',
    parallel_label: 'Parallel',
    export_config: 'Export',
    msg_importing: 'Importing...',
    msg_import_ok: 'containers imported',
    msg_no_containers: 'No containers imported',
    msg_ready: 'Ready — import your containers',
    msg_no_script: 'No script to copy',
    script_title_start: 'UDO - Ordered Docker container startup',
    script_title_stop: 'UDO - Ordered Docker container stop',
    script_title_update: 'UDO - Docker container update',
    msg_err_import: 'Import error: ',
    msg_err_parse: 'Parse error: ',
    msg_err_network: 'Network error: ',
    msg_err_install: 'Install error: ',
    msg_err_containers: 'Unable to load container list.',
    lbl_actifs: 'active',
    col_wait_for: 'wait_for',
  
    hint_drop_ignored: 'All ignored',
    prompt_group_name2: 'Group name',
    btn_add_manual: '+ add manually',
    lbl_stack_compose: 'Compose stack: ',
    dep_no_dep_free: 'No dependency - starts freely',
    dep_free_badge: '⊘ free',
    dep_add_btn: 'Add a dependency',
    dep_manual_from: 'Manually enabled by user',
    lbl_db_group: 'Database',
    dep_detected_label: 'Detected dependency: ',
    sim_estimated: 'Estimated time: ~',
    lbl_unsaved: '● Unsaved',
    dep_vol_access: ' accesses data from ',
    dep_net_share: ' shares network ',
  
    lbl_boot_delay: '⏱ Boot delay',
    lbl_seconds_unit: 's',
    lbl_abort_fail: '🛑 Abort on failure',
  
    btn_delete: 'Delete',
    btn_collapse_group: 'Collapse this group',
    btn_expand_all2: 'Expand all',
    lbl_parallel_mode: '∥ Parallel',
    lbl_dep_link: '🔗 Dependency',
    lbl_auto_rule: '⚙️ Auto rule',
    lbl_new_group: 'New Group',
    msg_min_one_group: 'At least one group is required.',
    msg_analyze_done2: 'Analysis done — you can now Classify.',
    settings_docker_timeout2: 'Docker wait timeout',
    pause_hint_db2: 'DB initialized via wait_for',
    pause_hint_media2: 'parallel, no pause needed',
    reset_rules_confirm: 'Reset all service rules?',
    reset_pauses_confirm: 'Reset pauses to default values?',
    reset_session_confirm: 'Reset the entire session?',
    msg_session_reset: 'Session reset',
    msg_config_imported: 'Config imported',
    msg_err_generic: 'Error: ',
    prompt_group_name3: 'Group name:',
    msg_groups_loaded: 'groups loaded from configuration',
    appfeed_unavailable: 'AppFeed unavailable — using built-in rules',
    preset_hc_detected: 'Healthcheck preset detected',
  
  
    toggle_wait_for_on: 'wait_for enabled: wait for this container to be ready before continuing',
    toggle_wait_for_off: 'wait_for disabled: start without waiting',
    toggle_enabled_on: 'Container active: will be started',
    toggle_enabled_off: 'Container disabled: will be skipped at startup',
    timeout_hint: 'Max wait time in seconds (wait_for)',
    hc_auto_hint: 'Click to enable/edit the healthcheck test command',
    hc_why_not_auto: 'Auto healthcheck only activates on containers with wait_for=ON and a detected preset',
  
    group_vpn_reseau: 'VPN / Network',
    group_bases_de_donnees: 'Databases',
    group_proxy_ssl: 'Proxy & SSL',
    group_ia_llm: 'AI & LLM',
    group_applications_web: 'Web applications',
    group_monitoring: 'Monitoring',
    group_serveurs_media: 'Media servers',
    group_gestion_medias: 'Media management',
    group_telechargement: 'Download',
    group_fichiers_sync: 'Files & Sync',
    group_outils: 'Tools',
    group_dns_adblock: 'DNS & AdBlock',
    group_auth: 'Auth',
    group_domotique: 'Home Automation',
  
    js_script_pause_group: 'pause after group',
    js_update_detection2: 'Update detection',
    js_update_none_available: 'No updates available',
  
  
    js_script_generated_on: '# Generated on ',
  
    js_script_dedup_skip: '# DUPLICATE skipped — already generated earlier:',
  
    settings_disabled_title: 'Containers disabled by default',
    settings_disabled_hint: 'These containers will be added with enabled=OFF during auto-classification.',
    settings_disabled_placeholder: 'container-name',
    settings_disabled_add: '+ Add',
    settings_disabled_empty: 'No containers disabled by default',
  
    msg_already_assigned: 'This container is already in another group',
  
  
    js_script_title_update: '# Unraid - Docker container update',
    js_update_section_start: 'Starting Update',
  
    import_config: 'Config import error',
  
    btn_save: 'Save config',
    btn_copy: 'Copy',
  
  
  
  
    msg_config_saved: '✓ Configuration saved',
  
    cron_select_days: 'Select at least one day',
  
    cron_preview_daily: 'Every day',
  
    cron_day_sun: 'Sun',
  
    cron_day_sat: 'Sat',
  
    cron_day_fri: 'Fri',
  
    cron_day_thu: 'Thu',
  
    cron_day_wed: 'Wed',
  
    cron_day_tue: 'Tue',
  
    cron_day_mon: 'Mon',
  
    cron_weekly: 'Specific days',
  
    cron_daily: 'Every day',
  
    cron_lbl_hour: 'Time',
  
    cron_lbl_days: 'Days',
  
    cron_lbl_freq: 'Frequency',
  
    cron_at_stopping: 'At server shutdown',
  
    cron_at_startup: 'At server startup',
  
    cron_stop_title: 'Shutdown',
  
    cron_start_title: 'Startup',
  
    msg_cron_saved_us: '✓ Schedule saved — reload User Scripts to see the change',
  
    dep_warn_same_group: '⚠ Placed before {dep} (same group)',
  
    dep_warn_same_group_short: 'same group',
  
    dep_warn_diff_group: '⚠ Placed before {dep} (group: {grp})',
  
    dep_warn_confirm: 'Some dependencies appear to be in the wrong order:',
  
    dep_warn_confirm_q: 'Generate the script anyway?',
  
    drift_title: 'Scripts may be outdated — configuration changed since last generation',
  
    drift_added: '+ Added',
  
    drift_removed: '- Removed',
  
    drift_ok: '✓ Scripts up to date — no changes detected',
  
    btn_check_drift: '🔄 Check',
  
    drift_scripts: 'Affected scripts',
  
    js_script_log_summary_update: 'FULL UPDATE LOG',
  },
  es: {
    subtitle:           "// Generador de UserScript — orden de inicio de contenedores",
    section_import:     "Importar docker ps",
    section_pool:       "Contenedores no asignados",
    section_groups:     "Grupos & orden de inicio",
    section_generate:   "Generar",
    btn_import:         "Importar",

  btn_import_docker:     "Importar desde Docker",
  btn_reset: "Reiniciar",
    reset_confirm: "¿Reiniciar toda la sesión? Se borrarán grupos, contenedores y pool.",
    btn_export: "Exportar config",
    js_script_title:    "# Unraid - Inicio ordenado de contenedores Docker",
    js_script_generated:function(d) { return "# Generado el " + d + " via Unraid Docker Script Generator"; },
    js_script_trigger:  "# Disparador: \"At Startup of Array\" en User Scripts",
    js_script_start_log:"echo \"$(date) - === Iniciando ===" + " \" > \"$LOG\"",
    js_script_wait_log: "    echo \"$(date) - Esperando: $name (max ${timeout}s)\" | tee -a \"$LOG\"",
    js_script_wait_timeout: "TIMEOUT:",
    js_script_end_log:  "echo \"$(date) - === Secuencia completada ===" + " \" | tee -a \"$LOG\"",
    js_script_disabled: "# DESACTIVADO: ",
    js_script_docker_wait_title: "# Verificando disponibilidad de Docker",
    js_script_docker_wait_log: 'echo "$(date) - Esperando Docker..." | tee -a "$LOG"',
    js_script_docker_ok: 'Docker listo',
    js_script_docker_timeout: 'ERROR: Docker no disponible tras 120s — abortando',
    js_script_abort_comment: 'Poner a 1 para abortar si wait_for expira',
    hc_level_good:  '🟢 Test automático configurado',
    hc_level_basic: '🟡 Test de puerto detectado',
    hc_level_none:  '🔴 Sin test — esperando running',
    hc_edit_title:  'Editar comando de prueba',
    hc_auto_btn:    'Detectar auto',
    hc_close_btn:   'Cerrar',
    hc_comment_good:  'Test fiable',
    hc_comment_basic: 'Test básico (puerto)',
    hc_comment_none:  'Sin test — esperando running',
    placeholder_check_cmd: 'ej: redis-cli ping | grep -q PONG',
    js_copy_ok:            '✓ Copiado',
    js_update_prune: 'Limpiando imágenes obsoletas...',
    js_update_prune_skip: 'Imágenes conservadas (opción activada)',
    label_boot_delay: '⏱ Retraso antes del inicio del Script (segundos)',
    settings_saved: 'Guardado',
    settings_general: 'Inicio general',
    settings_group_pauses: 'Pausas entre grupos',
    settings_docker_timeout: 'Timeout espera Docker',
    settings_add_service: 'Añadir servicio',
    settings_add_service_prompt: 'Nombre del servicio',
    settings_reset_confirm: '¿Restablecer valores predeterminados?',
    col_service: 'Servicio',
    col_check_cmd: 'Comando de prueba',
    label_boot_delay_short: 'Boot delay',
    pause_hint_vpn: 'dejar que VPN se establezca',
    pause_hint_db: 'BD iniciadas via wait_for',
    pause_hint_media: 'paralelo, sin pausa necesaria',
    pause_hint_dns: 'sin wait_for',
    js_script_boot_delay_comment: 'Retraso en segundos antes de iniciar contenedores',
    label_parallel: '∥ Paralelo',
    btn_collapse_all: '⊟ Contraer todo',
    btn_expand_all: '⊞ Expandir todo',
    btn_collapse: '▼ Contraer',
    btn_expand: '▶ Expandir',
    dep_detected: 'dependencia(s) detectada(s)',
    dep_accepted: 'aceptada(s)',
    dep_ignored: 'ignorada(s)',
    msg_analyze_required: 'Importación completa cargada — haga clic en 🔍 Analizar dependencias antes de Clasificar.',
    msg_analyze_done: 'Análisis completado — ahora puede Clasificar.',
    parallel_suggest: 'Este grupo puede ser paralelizado',
    parallel_activate: 'Activar',
    parallel_active_label: 'Modo paralelo activo',
    parallel_deactivate: 'Desactivar',
    js_script_log_summary: 'LOG COMPLETO DE INICIO',
    js_script_log_url: 'Log disponible en:',
    js_script_parallel_wait: 'Esperando fin del grupo paralelo',
    js_script_boot_delay_waiting: 'Esperando',
    js_script_abort_msg: 'ABORTANDO: timeout en',
    js_script_skip_dep: 'OMITIDO: dependencia no lista para',
    js_script_dep_not_ready: 'dependencia no lista',
    dep_vpn_via: "enruta su tráfico a través de",
    dep_must_start: "debe iniciarse primero",
    dep_accept_btn: "✓ Aceptar",
    dep_ignore_btn: "Ignorar",
    dep_must_after: "debe iniciarse después de",
    dep_db_connects: "se conecta a la base de datos",
    dep_proxy_exposed: "está expuesto detrás del proxy",
    dep_vol_share: "comparten el volumen",
    dep_depends: "depende de",
    dep_variable: "variable de entorno",
    dep_label: "etiqueta",
    stat_analyzed: "contenedores analizados —",
    stat_added_pool: "contenedor(es) añadido(s) al pool",
    stat_deps_applied: "dependencia(s) aplicada(s)",
    stat_reordered: "grupos reordenados",
    stat_wait_active: "✓ wait_for activado en",
    dep_no_deps: "No se detectaron dependencias.",
    dep_gpu_uses:       "usa la GPU (transcodificación hardware)",
    dep_gpu_driver:     "asegúrate de que el driver GPU esté cargado antes de este contenedor",
    dep_mqtt_connects:  "se conecta al broker MQTT",
    dep_auth_depends:   "está protegido por el servicio de autenticación",
    dep_healthcheck_info: "tiene un healthcheck — el script esperará el estado 'healthy' antes de continuar",
    dep_no_graph: "No hay dependencias que mostrar",
    inspect_loaded: "{n} contenedores cargados — solo datos locales",
    js_classify_required: "Por favor, clasifique los contenedores primero.",
  cron_disabled: "Cron desactivado",
  autostart_err: "Error autostart",
  autostart_saved: "Inicio automático configurado",
  manual_import_source: "Fuente (JSON docker inspect)",
  prompt_group_name: "Nombre del grupo:",
  col_timeout: "Timeout (s)",
  confirm_run: "¿Ejecutar el script ahora?",
  status_reset: "Sesión reiniciada",
  status_ready: "Listo",
  status_importing: "Importando...",
  error_no_script: "Genera un script primero",
    js_added: function(n) { return n + " contenedor(es) añadido(s)"; },
    js_appfeed_cached: function(n, age) { return n + " apps (en caché " + age + ")"; },
    js_appfeed_count: function(af, r) { return "Clasificado vía AppFeed: " + af + " | Reglas internas: " + r; },
    js_appfeed_dl: "Descargando AppFeed...",
    js_appfeed_err: function(e) { return "Error: " + e; },
    js_appfeed_github: function(n) { return n + " apps (descargadas)"; },
    js_appfeed_local: function(n) { return n + " apps (archivo local)"; },
    js_appfeed_nocache: function(n) { return n + " apps (sin caché)"; },
    js_appfeed_norules: function(r) { return "Clasificado vía reglas internas: " + r; },
    js_appfeed_notready: "AppFeed cargando...",
    js_appfeed_ready: "AppFeed listo",
    js_appfeed_warn: "Atención: AppFeed no cargado.",
    js_cache_clear: "Vaciando caché...",
    js_cache_err: "Error al vaciar la caché",
    js_classify_done: "Clasificación completada:",
    js_pool_empty: "Sin contenedores en el pool",
    js_unclassified: "Sin clasificar",
    btn_copy_script: "Copiar",
    label_dry_run:         '🔍 Dry-run — simular sin modificar (pull para el despliegue',
    help_guide: `Guía de uso Unraid Docker Orchestrator

1. IMPORTAR contenedores
   Haga clic en "Importar desde Docker" para cargar automáticamente todos sus contenedores.

2. CLASIFICAR contenedores
   Haga clic en "Clasificar automáticamente" — el plugin detecta grupos lógicos (BD, Proxy, IA…).

3. AJUSTAR el orden
   Arrastre y suelte grupos enteros (por el encabezado) o contenedores dentro de los grupos.
   Active el modo paralelo en grupos independientes para acelerar el inicio.

4. CONFIGURAR dependencias
   El panel "Dependencias" muestra los enlaces detectados (volúmenes, redes, healthchecks).
   Active wait_for en contenedores críticos para esperar que estén listos.

5. GENERAR scripts
   Haga clic en "Generar" para obtener 3 scripts: Inicio, Parada, Actualización.

6. LICENCIA
   Unraid Docker Orchestrator — Copyright (C) 2026 Parralex-Labs
   Distribuido bajo la Licencia Publica General GNU v3.0

4. CONFIGURAR dependencias
   El panel "Dependencias" muestra los enlaces detectados (volúmenes, redes, healthchecks).
   Active wait_for en contenedores críticos para esperar que estén listos.

5. GENERAR scripts
   Haga clic en "Generar" para obtener 3 scripts: Inicio, Parada, Actualización.

6. LICENCIA
   Unraid Docker Orchestrator — Copyright (C) 2026 Parralex-Labs
   Distribuido bajo la GNU General Public License v3.0
   https://github.com/Parralex-Labs/Unraid-Docker-Orchestrator`,
  
    btn_json_manual: 'JSON manual',
    btn_auto_classify: 'Auto-clasificar',
    placeholder_inspect: 'Pegar salida de docker inspect aquí...',
    msg_empty_start: 'Haga clic en "Importar desde Docker" para comenzar',
    btn_simulate: "⏱ Simular",
    btn_add_group: 'Grupo',
    sim_title: "⏱ Simulación de inicio",
    label_keep_images: 'Conservar imágenes',
    label_protect_db: 'Proteger imágenes BD',
    btn_generate: 'Generar script',
    btn_install: 'Instalar en User Scripts',
    btn_run_now: 'Ejecutar ahora',
    section_exec_log: 'Salida de ejecución',
    cron_update_title: "🔄 Actualización automática",
    cron_weekly_sun: 'Cada domingo a las 4h',
    cron_weekly_mon: 'Cada lunes a las 4h',
    cron_monthly: '1er del mes a las 3h',
    cron_custom: 'Personalizado...',
    cron_status_title: "📊 Estado",
    cron_update_label: 'Actualización:',
    cron_inactive: 'Desactivado',
  
    js_script_absent: 'AUSENTE $name — ignorado',
    js_script_flock_start: 'Script start ya en curso — cancelar',
    js_script_flock_stop: 'Script stop ya en curso — cancelar',
    js_script_flock_update: 'Script update ya en curso — cancelar',
    js_script_err_line: 'ERROR línea $LINENO',
    js_script_warn_start: 'ADVERTENCIA: error al iniciar $name',
    js_script_comment_nbsp: 'Limpieza preventiva de NBSP (U+00A0) del copiar-pegar del navegador',
    js_script_comment_flock: 'Protección contra doble ejecución (flock)',
    js_script_comment_parallel: 'Lanzamiento paralelo con log individual',
    js_script_comment_stop_parallel: 'Parada paralela con log individual',
    js_script_comment_stop_ordered: 'Script de parada ordenada de contenedores',
    js_script_comment_wait_docker: 'Esperando que Docker esté disponible',
    js_script_comment_resolve_port: 'Resuelve el puerto host mapeado desde un puerto de contenedor dado',
    js_script_comment_test_host: 'Prueba desde el host resolviendo el HostPort para un puerto de contenedor dado',
    js_update_section_ip: 'Recuperación de IP y URL del log',
  
  
    app_title: 'Unraid Docker Orchestrator',
  
    col_active: 'Activo',
    col_container: 'Contenedor',
    col_hc_test: 'Test de salud',
    js_pause_label: 'Pausa tras grupo',
    prompt_dep_name: 'Nombre de dependencia',
  
    js_script_comment_resolve_ports: 'Resolver puertos: HostConfig.PortBindings (siempre disp.) + NetworkSettings.Ports (runtime)',
    js_script_comment_portbindings: 'PortBindings: disponible incluso con contenedor detenido',
    js_script_comment_netsports: 'Completar con NetworkSettings.Ports si está corriendo',
    js_script_comment_static_cache: 'Caché de campos estáticos (calculado una vez)',
    js_script_comment_exec1: 'Intento 1: docker exec dentro del contenedor',
    js_script_comment_exec2: 'Intento 2: nc -z en HostPorts desde el host (bridge estándar)',
    js_script_comment_exec3: 'Intento 3: nc -z en IP del contenedor (macvlan/br0)',
    js_script_comment_ep_cache: 'usado desde caché',
    js_script_comment_fallback_running: 'Fallback: corriendo 10s sin puerto accesible (red aislada)',
    js_script_comment_sleep_adaptive: 'Sleep adaptativo: 1s primeros 10 segundos, 2s después',
    js_script_comment_vpn_detect: 'Detección automática del padre VPN (NetworkMode: container:X)',
    js_script_comment_absent: 'contenedor ausente: no fatal',
  
    js_script_comment_already_stopped: 'OMITIR $name (ya detenido)',
    js_update_summary_msg: 'contenedor(es) actualizado(s):',
  
    col_seconds: 'segundos',
    hint_drop: 'Suelte contenedores aquí',
    lbl_container_count: 'contenedor',
    lbl_containers_count: 'contenedores',
    lbl_active: 'activos',
    lbl_active_count: 'activo',
    placeholder_cname: 'nombre-contenedor',
    parallel_label: 'Paralelo',
    export_config: 'Exportar',
    msg_importing: 'Importando...',
    msg_import_ok: 'contenedores importados',
    msg_no_containers: 'Sin contenedores importados',
    msg_ready: 'Listo — importe sus contenedores',
    msg_no_script: 'Sin script para copiar',
    script_title_start: 'UDO - Inicio ordenado de contenedores Docker',
    script_title_stop: 'UDO - Parada ordenada de contenedores Docker',
    script_title_update: 'UDO - Actualización de contenedores Docker',
    msg_err_import: 'Error de importación: ',
    msg_err_parse: 'Error de análisis: ',
    msg_err_network: 'Error de red: ',
    msg_err_install: 'Error de instalación: ',
    msg_err_containers: 'No se puede cargar la lista de contenedores.',
    lbl_actifs: 'activos',
    col_wait_for: 'wait_for',
  
    hint_drop_ignored: 'Todas ignoradas',
    prompt_group_name2: 'Nombre del grupo',
    btn_add_manual: '+ agregar manualmente',
    lbl_stack_compose: 'Stack compose: ',
    dep_no_dep_free: 'Sin dependencia - inicia libremente',
    dep_free_badge: '⊘ libre',
    dep_add_btn: 'Agregar una dependencia',
    dep_manual_from: 'Habilitado manualmente por el usuario',
    lbl_db_group: 'Base de datos',
    dep_detected_label: 'Dependencia detectada: ',
    sim_estimated: 'Tiempo estimado: ~',
    lbl_unsaved: '● Sin guardar',
    dep_vol_access: ' accede a los datos de ',
    dep_net_share: ' comparte la red ',
  
    lbl_boot_delay: '⏱ Boot delay',
    lbl_seconds_unit: 's',
    lbl_abort_fail: '🛑 Abortar si falla',
  
    btn_delete: 'Eliminar',
    btn_collapse_group: 'Colapsar este grupo',
    btn_expand_all2: 'Expandir todo',
    lbl_parallel_mode: '∥ Paralelo',
    lbl_dep_link: '🔗 Dependencia',
    lbl_auto_rule: '⚙️ Regla auto',
    lbl_new_group: 'Nuevo Grupo',
    msg_min_one_group: 'Se necesita al menos un grupo.',
    msg_analyze_done2: 'Análisis completo — puede clasificar ahora.',
    settings_docker_timeout2: 'Timeout espera Docker',
    pause_hint_db2: 'BD inicializada via wait_for',
    pause_hint_media2: 'paralelo, sin pausa necesaria',
    reset_rules_confirm: '¿Restablecer todas las reglas de servicio?',
    reset_pauses_confirm: '¿Restablecer pausas a valores por defecto?',
    reset_session_confirm: '¿Restablecer toda la sesión?',
    msg_session_reset: 'Sesión reiniciada',
    msg_config_imported: 'Configuración importada',
    msg_err_generic: 'Error: ',
    prompt_group_name3: 'Nombre del grupo:',
    msg_groups_loaded: 'grupos cargados desde la configuración',
    appfeed_unavailable: 'AppFeed no disponible — usando reglas integradas',
    preset_hc_detected: 'Preset healthcheck detectado',
  
  
    toggle_wait_for_on: 'wait_for activado: esperar que este contenedor esté listo antes de continuar',
    toggle_wait_for_off: 'wait_for desactivado: iniciar sin esperar',
    toggle_enabled_on: 'Contenedor activo: será iniciado',
    toggle_enabled_off: 'Contenedor desactivado: se omitirá al inicio',
    timeout_hint: 'Tiempo máximo de espera en segundos (wait_for)',
    hc_auto_hint: 'Hacer clic para activar/editar el comando de prueba healthcheck',
    hc_why_not_auto: 'El healthcheck auto solo se activa en contenedores con wait_for=ON y un preset detectado',
  
    group_vpn_reseau: 'VPN / Red',
    group_bases_de_donnees: 'Bases de datos',
    group_proxy_ssl: 'Proxy & SSL',
    group_ia_llm: 'IA & LLM',
    group_applications_web: 'Aplicaciones web',
    group_monitoring: 'Monitorización',
    group_serveurs_media: 'Servidores de medios',
    group_gestion_medias: 'Gestión de medios',
    group_telechargement: 'Descarga',
    group_fichiers_sync: 'Archivos & Sync',
    group_outils: 'Herramientas',
    group_dns_adblock: 'DNS & AdBlock',
    group_auth: 'Autenticación',
    group_domotique: 'Domótica',
  
    js_script_pause_group: 'pausa tras grupo',
    js_update_detection2: 'Detección de actualizaciones',
    js_update_none_available: 'No hay actualizaciones disponibles',
  
  
    js_script_generated_on: '# Generado el ',
  
    js_script_dedup_skip: '# DUPLICADO omitido — ya generado anteriormente:',
  
    settings_disabled_title: 'Contenedores desactivados por defecto',
    settings_disabled_hint: 'Estos contenedores se agregarán con enabled=OFF durante la clasificación.',
    settings_disabled_placeholder: 'nombre-contenedor',
    settings_disabled_add: '+ Agregar',
    settings_disabled_empty: 'Sin contenedores desactivados por defecto',
  
    msg_already_assigned: 'Este contenedor ya está en otro grupo',
  
  
    js_script_title_update: '# Unraid - Actualización de contenedores Docker',
    js_update_section_start: 'Inicio de Actualización',
  
    import_config: 'Error importar config',
  
    btn_save: 'Guardar',
    btn_copy: 'Copiar',
  
  
  
  
    msg_config_saved: '✓ Configuración guardada',
  
    cron_select_days: 'Seleccione un día',
  
    cron_preview_daily: 'Todos los días',
  
    cron_day_sun: 'Dom',
  
    cron_day_sat: 'Sáb',
  
    cron_day_fri: 'Vie',
  
    cron_day_thu: 'Jue',
  
    cron_day_wed: 'Mié',
  
    cron_day_tue: 'Mar',
  
    cron_day_mon: 'Lun',
  
    cron_weekly: 'Días específicos',
  
    cron_daily: 'Todos los días',
  
    cron_lbl_hour: 'Hora',
  
    cron_lbl_days: 'Días',
  
    cron_lbl_freq: 'Frecuencia',
  
    cron_at_stopping: 'Al detener el servidor',
  
    cron_at_startup: 'Al iniciar el servidor',
  
    cron_stop_title: 'Parada',
  
    cron_start_title: 'Inicio',
  
    msg_cron_saved_us: '✓ Programación guardada — recargue User Scripts para ver el cambio',
  
    dep_warn_same_group: '⚠ Colocado antes de {dep} (mismo grupo)',
  
    dep_warn_same_group_short: 'mismo grupo',
  
    dep_warn_diff_group: '⚠ Colocado antes de {dep} (grupo: {grp})',
  
    dep_warn_confirm: 'Algunas dependencias parecen estar en orden incorrecto:',
  
    dep_warn_confirm_q: '¿Generar el script de todos modos?',
  
    drift_title: 'Scripts posiblemente desactualizados — la configuración cambió desde la última generación',
  
    drift_added: '+ Añadidos',
  
    drift_removed: '- Eliminados',
  
    drift_ok: '✓ Scripts actualizados — sin cambios detectados',
  
    btn_check_drift: '🔄 Verificar',
  
    drift_scripts: 'Scripts afectados',
  
    js_script_log_summary_update: 'LOG COMPLETO DE ACTUALIZACION',
  },
  de: {
    subtitle:           "// UserScript-Generator — Startreihenfolge der Container",
    section_import:     "Docker ps importieren",
    section_pool:       "Nicht zugewiesene Container",
    section_groups:     "Gruppen & Startreihenfolge",
    section_generate:   "Generieren",
    btn_import:         "Importieren",

  btn_import_docker:     "Von Docker importieren",
  btn_reset: "Zurücksetzen",
    reset_confirm: "Gesamte Sitzung zurücksetzen? Alle Gruppen, Container und Pool werden gelöscht.",
    btn_export: "Konfig exportieren",
    js_script_title:    "# Unraid - Geordneter Docker-Container-Start",
    js_script_generated:function(d) { return "# Generiert am " + d + " via Unraid Docker Script Generator"; },
    js_script_trigger:  "# Ausloser: \"At Startup of Array\" in User Scripts",
    js_script_start_log:"echo \"$(date) - === Starte ===" + " \" > \"$LOG\"",
    js_script_wait_log: "    echo \"$(date) - Warte auf: $name (max ${timeout}s)\" | tee -a \"$LOG\"",
    js_script_wait_timeout: "TIMEOUT:",
    js_script_end_log:  "echo \"$(date) - === Sequenz abgeschlossen ===" + " \" | tee -a \"$LOG\"",
    js_script_disabled: "# DEAKTIVIERT: ",
    js_script_docker_wait_title: "# Docker-Verfügbarkeit prüfen",
    js_script_docker_wait_log: 'echo "$(date) - Warte auf Docker..." | tee -a "$LOG"',
    js_script_docker_ok: 'Docker bereit',
    js_script_docker_timeout: 'FEHLER: Docker nach 120s nicht verfügbar — Abbruch',
    js_script_abort_comment: 'Auf 1 setzen um abzubrechen wenn wait_for timeout',
    hc_level_good:  '🟢 Auto-Test konfiguriert',
    hc_level_basic: '🟡 Port-Test erkannt',
    hc_level_none:  '🔴 Kein Test — warte auf running',
    hc_edit_title:  'Testbefehl bearbeiten',
    hc_auto_btn:    'Auto erkennen',
    hc_close_btn:   'Schließen',
    hc_comment_good:  'Zuverlässiger Test',
    hc_comment_basic: 'Einfacher Test (Port)',
    hc_comment_none:  'Kein Test — warte auf running',
    placeholder_check_cmd: 'z.B. redis-cli ping | grep -q PONG',
    js_copy_ok:            '✓ Kopiert',
    js_update_prune: 'Veraltete Images werden bereinigt...',
    js_update_prune_skip: 'Images behalten (Option aktiviert)',
    label_boot_delay: '⏱ Verzögerung vor Skriptstart (Sekunden)',
    settings_saved: 'Gespeichert',
    settings_general: 'Allgemeiner Start',
    settings_group_pauses: 'Pausen zwischen Gruppen',
    settings_docker_timeout: 'Docker-Wartetimeout',
    settings_add_service: 'Dienst hinzufügen',
    settings_add_service_prompt: 'Dienstname',
    settings_reset_confirm: 'Auf Standardwerte zurücksetzen?',
    col_service: 'Dienst',
    col_check_cmd: 'Testbefehl',
    label_boot_delay_short: 'Boot-Verzögerung',
    pause_hint_vpn: 'VPN aufbauen lassen',
    pause_hint_db: 'DB via wait_for initialisiert',
    pause_hint_media: 'parallel, keine Pause nötig',
    pause_hint_dns: 'kein wait_for',
    js_script_boot_delay_comment: 'Verzögerung in Sekunden vor dem Start der Container',
    label_parallel: '∥ Parallel',
    js_script_parallel_wait: 'Warten auf Ende der parallelen Gruppe',
    btn_collapse_all: '⊟ Alle einklappen',
    btn_expand_all: '⊞ Alle ausklappen',
    btn_collapse: '▼ Einklappen',
    btn_expand: '▶ Ausklappen',
    dep_detected: 'Abhängigkeit(en) erkannt',
    dep_accepted: 'akzeptiert',
    dep_ignored: 'ignoriert',
    msg_analyze_required: 'Vollständiger Import geladen — klicken Sie auf 🔍 Abhängigkeiten analysieren vor der Klassifizierung.',
    msg_analyze_done: 'Analyse abgeschlossen — Sie können jetzt klassifizieren.',
    parallel_suggest: 'Diese Gruppe kann parallelisiert werden',
    parallel_activate: 'Aktivieren',
    parallel_active_label: 'Parallelmodus aktiv',
    parallel_deactivate: 'Deaktivieren',
    js_script_log_summary: 'VOLLSTÄNDIGES STARTPROTOKOLL',
    js_script_log_url: 'Log verfügbar unter:',
    js_script_boot_delay_waiting: 'Warten',
    js_script_abort_msg: 'ABBRUCH: Timeout bei',
    js_script_skip_dep: 'ÜBERSPRUNGEN: Abhängigkeit nicht bereit für',
    js_script_dep_not_ready: 'Abhängigkeit nicht bereit',
    dep_vpn_via: "leitet seinen Datenverkehr über",
    dep_must_start: "muss zuerst gestartet werden",
    dep_accept_btn: "✓ Akzeptieren",
    dep_ignore_btn: "Ignorieren",
    dep_must_after: "muss nach starten",
    dep_db_connects: "verbindet sich mit Datenbank",
    dep_proxy_exposed: "wird hinter Proxy exponiert",
    dep_vol_share: "teilen Volume",
    dep_depends: "hängt ab von",
    dep_variable: "Umgebungsvariable",
    dep_label: "Label",
    stat_analyzed: "Container analysiert —",
    stat_added_pool: "Container dem Pool hinzugefügt",
    stat_deps_applied: "Abhängigkeit(en) angewendet",
    stat_reordered: "Gruppen neu geordnet",
    stat_wait_active: "✓ wait_for aktiviert für",
    dep_no_deps: "Keine Abhängigkeit erkannt.",
    dep_gpu_uses:       "verwendet die GPU (Hardware-Transcodierung)",
    dep_gpu_driver:     "stelle sicher, dass der GPU-Treiber vor diesem Container geladen ist",
    dep_mqtt_connects:  "verbindet sich mit dem MQTT-Broker",
    dep_auth_depends:   "wird durch den Authentifizierungsdienst geschützt",
    dep_healthcheck_info: "hat einen Healthcheck — das Skript wartet auf den Status 'healthy' bevor es weitergeht",
    dep_no_graph: "Keine Abhängigkeiten anzuzeigen",
    inspect_loaded: "{n} Container geladen — nur lokale Daten",
    js_classify_required: "Bitte zuerst Container klassifizieren.",
  cron_disabled: "Cron deaktiviert",
  autostart_err: "Autostart-Fehler",
  autostart_saved: "Autostart konfiguriert",
  manual_import_source: "Quelle (JSON docker inspect)",
  prompt_group_name: "Gruppenname:",
  col_timeout: "Timeout (s)",
  confirm_run: "Script jetzt ausführen?",
  status_reset: "Sitzung zurückgesetzt",
  status_ready: "Bereit",
  status_importing: "Importiere...",
  error_no_script: "Zuerst Script generieren",
    js_added: function(n) { return n + " Container hinzugefügt"; },
    js_appfeed_cached: function(n, age) { return n + " Apps (gecacht " + age + ")"; },
    js_appfeed_count: function(af, r) { return "Klassifiziert via AppFeed: " + af + " | Integrierte Regeln: " + r; },
    js_appfeed_dl: "AppFeed wird heruntergeladen...",
    js_appfeed_err: function(e) { return "Fehler: " + e; },
    js_appfeed_github: function(n) { return n + " Apps (heruntergeladen)"; },
    js_appfeed_local: function(n) { return n + " Apps (lokale Datei)"; },
    js_appfeed_nocache: function(n) { return n + " Apps (kein Cache)"; },
    js_appfeed_norules: function(r) { return "Klassifiziert via integrierte Regeln: " + r; },
    js_appfeed_notready: "AppFeed wird geladen...",
    js_appfeed_ready: "AppFeed bereit",
    js_appfeed_warn: "Achtung: AppFeed nicht geladen.",
    js_cache_clear: "Cache wird geleert...",
    js_cache_err: "Fehler beim Leeren des Caches",
    js_classify_done: "Klassifizierung abgeschlossen:",
   help_guide: `Benutzerhandbuch Unraid Docker Orchestrator

1. CONTAINER IMPORTIEREN
   Klicken Sie auf "Von Docker importieren", um alle Container automatisch zu laden.

2. CONTAINER KLASSIFIZIEREN
   Klicken Sie auf "Automatisch klassifizieren" — das Plugin erkennt logische Gruppen (DB, Proxy, KI…).

3. REIHENFOLGE ANPASSEN
   Ziehen Sie ganze Gruppen (am Header) oder Container per Drag & Drop.
   Aktivieren Sie den Parallelmodus für unabhängige Gruppen, um den Start zu beschleunigen.

4. ABHÄNGIGKEITEN KONFIGURIEREN
   Das Panel "Abhängigkeiten" zeigt erkannte Verbindungen (Volumes, Netzwerke, Healthchecks).
   Aktivieren Sie wait_for für kritische Container.

5. SKRIPTE GENERIEREN
   Klicken Sie auf "Generieren" für 3 Skripte: Start, Stop, Update.

6. LIZENZ
   Unraid Docker Orchestrator — Copyright (C) 2026 Parralex-Labs

2. CONTAINER KLASSIFIZIEREN
   Klicken Sie auf "Automatisch klassifizieren" — das Plugin erkennt logische Gruppen (DB, Proxy, KI…).

3. REIHENFOLGE ANPASSEN
   Ziehen Sie ganze Gruppen (am Header) oder Container per Drag & Drop.
   Aktivieren Sie den Parallelmodus für unabhängige Gruppen, um den Start zu beschleunigen.

4. ABHÄNGIGKEITEN KONFIGURIEREN
   Das Panel "Abhängigkeiten" zeigt erkannte Verbindungen (Volumes, Netzwerke, Healthchecks).
   Aktivieren Sie wait_for für kritische Container.

5. SKRIPTE GENERIEREN
   Klicken Sie auf "Generieren" für 3 Skripte: Start, Stop, Update.

6. LIZENZ
   Unraid Docker Orchestrator — Copyright (C) 2026 Parralex-Labs
   Verteilt unter der GNU General Public License v3.0
   https://github.com/Parralex-Labs/Unraid-Docker-Orchestrator`,
  
    btn_json_manual: 'Manuelles JSON',
    btn_auto_classify: 'Auto-klassifizieren',
    placeholder_inspect: 'docker inspect Ausgabe hier einfügen...',
    msg_empty_start: 'Klicken Sie auf "Von Docker importieren" um zu beginnen',
    btn_simulate: "⏱ Simulieren",
    btn_add_group: 'Gruppe',
    sim_title: "⏱ Startsimulation",
    label_keep_images: 'Alte Images behalten',
    label_protect_db: 'DB-Images schützen',
    btn_generate: 'Skript generieren',
    btn_install: 'In User Scripts installieren',
    btn_run_now: 'Jetzt ausführen',
    section_exec_log: 'Ausführungsausgabe',
    cron_update_title: "🔄 Automatische Aktualisierung",
    cron_weekly_sun: 'Jeden Sonntag um 4 Uhr',
    cron_weekly_mon: 'Jeden Montag um 4 Uhr',
    cron_monthly: '1. des Monats um 3 Uhr',
    cron_custom: 'Benutzerdefiniert...',
    cron_status_title: "📊 Status",
    cron_update_label: 'Update:',
    cron_inactive: 'Deaktiviert',
  
    js_script_absent: 'FEHLT $name — übersprungen',
    js_script_flock_start: 'Start-Skript läuft bereits — Abbruch',
    js_script_flock_stop: 'Stop-Skript läuft bereits — Abbruch',
    js_script_flock_update: 'Update-Skript läuft bereits — Abbruch',
    js_script_err_line: 'FEHLER Zeile $LINENO',
    js_script_warn_start: 'WARN: Start fehlgeschlagen $name',
    js_script_comment_nbsp: 'Präventive Bereinigung von NBSP (U+00A0) aus Browser-Kopieren',
    js_script_comment_flock: 'Schutz vor Doppelausführung (flock)',
    js_script_comment_parallel: 'Paralleler Start mit individuellem Log',
    js_script_comment_stop_parallel: 'Paralleler Stop mit individuellem Log',
    js_script_comment_stop_ordered: 'Geordnetes Container-Stopp-Skript',
    js_script_comment_wait_docker: 'Warten auf Docker-Verfügbarkeit',
    js_script_comment_resolve_port: 'Löst den Host-Port auf, der einem Container-Port zugeordnet ist',
    js_script_comment_test_host: 'Testet vom Host aus durch Auflösen des HostPorts für einen Container-Port',
    js_update_section_ip: 'IP- und Log-URL-Abruf',
  
  
    app_title: 'Unraid Docker Orchestrator',
  
    col_active: 'Aktiv',
    col_container: 'Container',
    col_hc_test: 'Gesundheitstest',
    js_pause_label: 'Pause nach Gruppe',
    prompt_dep_name: 'Abhängigkeitsname',
  
    js_script_comment_resolve_ports: 'Ports auflösen: HostConfig.PortBindings (immer verfügbar) + NetworkSettings.Ports (Laufzeit)',
    js_script_comment_portbindings: 'PortBindings: auch bei gestopptem Container verfügbar',
    js_script_comment_netsports: 'Ergänzen mit NetworkSettings.Ports wenn läuft',
    js_script_comment_static_cache: 'Statische Felder cachen (einmal berechnet)',
    js_script_comment_exec1: 'Versuch 1: docker exec im Container',
    js_script_comment_exec2: 'Versuch 2: nc -z auf HostPorts vom Host (Standard-Bridge)',
    js_script_comment_exec3: 'Versuch 3: nc -z auf Container-IP (macvlan/br0)',
    js_script_comment_ep_cache: 'aus Cache verwendet',
    js_script_comment_fallback_running: 'Fallback: 10s laufend ohne zugänglichen Port (isoliertes Netzwerk)',
    js_script_comment_sleep_adaptive: 'Adaptiver Sleep: 1s erste 10 Sekunden, danach 2s',
    js_script_comment_vpn_detect: 'Automatische VPN-Elternerkennung (NetworkMode: container:X)',
    js_script_comment_absent: 'Container fehlt: nicht fatal',
  
    js_script_comment_already_stopped: 'ÜBERSPR. $name (bereits gestoppt)',
    js_update_summary_msg: 'Container aktualisiert:',
  
    col_seconds: 'Sekunden',
    hint_drop: 'Container hier ablegen',
    lbl_container_count: 'Container',
    lbl_containers_count: 'Container',
    lbl_active: 'aktiv',
    lbl_active_count: 'aktiv',
    placeholder_cname: 'container-name',
    parallel_label: 'Parallel',
    export_config: 'Export',
    msg_importing: 'Importiere...',
    msg_import_ok: 'Container importiert',
    msg_no_containers: 'Keine Container importiert',
    msg_ready: 'Bereit — Container importieren',
    msg_no_script: 'Kein Skript zum Kopieren',
    script_title_start: 'UDO - Geordneter Docker-Container-Start',
    script_title_stop: 'UDO - Geordneter Docker-Container-Stop',
    script_title_update: 'UDO - Docker-Container-Update',
    msg_err_import: 'Importfehler: ',
    msg_err_parse: 'Parse-Fehler: ',
    msg_err_network: 'Netzwerkfehler: ',
    msg_err_install: 'Installationsfehler: ',
    msg_err_containers: 'Container-Liste kann nicht geladen werden.',
    lbl_actifs: 'aktiv',
    col_wait_for: 'wait_for',
  
    hint_drop_ignored: 'Alle ignoriert',
    prompt_group_name2: 'Gruppenname',
    btn_add_manual: '+ manuell hinzufügen',
    lbl_stack_compose: 'Compose-Stack: ',
    dep_no_dep_free: 'Keine Abhängigkeit - startet frei',
    dep_free_badge: '⊘ frei',
    dep_add_btn: 'Abhängigkeit hinzufügen',
    dep_manual_from: 'Manuell vom Benutzer aktiviert',
    lbl_db_group: 'Datenbank',
    dep_detected_label: 'Erkannte Abhängigkeit: ',
    sim_estimated: 'Geschätzte Zeit: ~',
    lbl_unsaved: '● Nicht gespeichert',
    dep_vol_access: ' greift auf Daten zu von ',
    dep_net_share: ' teilt das Netzwerk ',
  
    lbl_boot_delay: '⏱ Boot delay',
    lbl_seconds_unit: 's',
    lbl_abort_fail: '🛑 Abbruch bei Fehler',
  
    btn_delete: 'Löschen',
    btn_collapse_group: 'Gruppe einklappen',
    btn_expand_all2: 'Alle ausklappen',
    lbl_parallel_mode: '∥ Parallel',
    lbl_dep_link: '🔗 Abhängigkeit',
    lbl_auto_rule: '⚙️ Auto-Regel',
    lbl_new_group: 'Neue Gruppe',
    msg_min_one_group: 'Mindestens eine Gruppe erforderlich.',
    msg_analyze_done2: 'Analyse abgeschlossen — Sie können jetzt klassifizieren.',
    settings_docker_timeout2: 'Docker-Wartetimeout',
    pause_hint_db2: 'DB initialisiert via wait_for',
    pause_hint_media2: 'parallel, keine Pause nötig',
    reset_rules_confirm: 'Alle Dienstregeln zurücksetzen?',
    reset_pauses_confirm: 'Pausen auf Standardwerte zurücksetzen?',
    reset_session_confirm: 'Gesamte Sitzung zurücksetzen?',
    msg_session_reset: 'Sitzung zurückgesetzt',
    msg_config_imported: 'Konfiguration importiert',
    msg_err_generic: 'Fehler: ',
    prompt_group_name3: 'Gruppenname:',
    msg_groups_loaded: 'Gruppen aus Konfiguration geladen',
    appfeed_unavailable: 'AppFeed nicht verfügbar — integrierte Regeln verwendet',
    preset_hc_detected: 'Healthcheck-Preset erkannt',
  
  
    toggle_wait_for_on: 'wait_for aktiviert: warten bis dieser Container bereit ist bevor weiter',
    toggle_wait_for_off: 'wait_for deaktiviert: starten ohne zu warten',
    toggle_enabled_on: 'Container aktiv: wird gestartet',
    toggle_enabled_off: 'Container deaktiviert: wird beim Start übersprungen',
    timeout_hint: 'Maximale Wartezeit in Sekunden (wait_for)',
    hc_auto_hint: 'Klicken um Healthcheck-Testbefehl zu aktivieren/bearbeiten',
    hc_why_not_auto: 'Auto-Healthcheck aktiviert sich nur bei Containern mit wait_for=EIN und erkanntem Preset',
  
    group_vpn_reseau: 'VPN / Netzwerk',
    group_bases_de_donnees: 'Datenbanken',
    group_proxy_ssl: 'Proxy & SSL',
    group_ia_llm: 'KI & LLM',
    group_applications_web: 'Webanwendungen',
    group_monitoring: 'Überwachung',
    group_serveurs_media: 'Medienserver',
    group_gestion_medias: 'Medienverwaltung',
    group_telechargement: 'Downloads',
    group_fichiers_sync: 'Dateien & Sync',
    group_outils: 'Werkzeuge',
    group_dns_adblock: 'DNS & AdBlock',
    group_auth: 'Authentifizierung',
    group_domotique: 'Hausautomation',
  
    js_script_pause_group: 'Pause nach Gruppe',
    js_update_detection2: 'Update-Erkennung',
    js_update_none_available: 'Keine Updates verfügbar',
  
  
    js_script_generated_on: '# Generiert am ',
  
    js_script_dedup_skip: '# DUPLIKAT übersprungen — bereits früher generiert:',
  
    settings_disabled_title: 'Standardmäßig deaktivierte Container',
    settings_disabled_hint: 'Diese Container werden bei der Auto-Klassifizierung mit enabled=OFF hinzugefügt.',
    settings_disabled_placeholder: 'container-name',
    settings_disabled_add: '+ Hinzufügen',
    settings_disabled_empty: 'Keine Container standardmäßig deaktiviert',
  
    msg_already_assigned: 'Dieser Container ist bereits in einer anderen Gruppe',
  
  
    js_script_title_update: '# Unraid - Docker-Container-Update',
    js_update_section_start: 'Update wird gestartet',
  
    import_config: 'Fehler beim Config-Import',
  
    btn_save: 'Speichern',
    btn_copy: 'Kopieren',
  
  
  
  
    msg_config_saved: '✓ Konfiguration gespeichert',
  
    cron_select_days: 'Tag auswählen',
  
    cron_preview_daily: 'Täglich',
  
    cron_day_sun: 'So',
  
    cron_day_sat: 'Sa',
  
    cron_day_fri: 'Fr',
  
    cron_day_thu: 'Do',
  
    cron_day_wed: 'Mi',
  
    cron_day_tue: 'Di',
  
    cron_day_mon: 'Mo',
  
    cron_weekly: 'Bestimmte Tage',
  
    cron_daily: 'Täglich',
  
    cron_lbl_hour: 'Uhrzeit',
  
    cron_lbl_days: 'Tage',
  
    cron_lbl_freq: 'Häufigkeit',
  
    cron_at_stopping: 'Beim Serverstopp',
  
    cron_at_startup: 'Beim Serverstart',
  
    cron_stop_title: 'Stopp',
  
    cron_start_title: 'Start',
  
    msg_cron_saved_us: '✓ Zeitplan gespeichert — User Scripts neu laden um die Änderung zu sehen',
  
    dep_warn_same_group: '⚠ Vor {dep} platziert (gleiche Gruppe)',
  
    dep_warn_same_group_short: 'gleiche Gruppe',
  
    dep_warn_diff_group: '⚠ Vor {dep} platziert (Gruppe: {grp})',
  
    dep_warn_confirm: 'Einige Abhängigkeiten scheinen in falscher Reihenfolge:',
  
    dep_warn_confirm_q: 'Skript trotzdem generieren?',
  
    drift_title: 'Skripte möglicherweise veraltet — Konfiguration seit letzter Generierung geändert',
  
    drift_added: '+ Hinzugefügt',
  
    drift_removed: '- Entfernt',
  
    drift_ok: '✓ Skripte aktuell — keine Änderungen erkannt',
  
    btn_check_drift: '🔄 Prüfen',
  
    drift_scripts: 'Betroffene Skripte',
  
    js_script_log_summary_update: 'VOLLSTAENDIGES UPDATEPROTOKOLL',
  }
};;

/**
 * Get current language from UDO_LANG (injected by PHP) or cookie
 */
var currentLang = (typeof UDO_LANG !== 'undefined' ? UDO_LANG : null)
               || document.cookie.replace(/(?:(?:^|.*;\s*)lang\s*=\s*([^;]*).*$)|^.*$/, '$1')
               || 'fr';

/**
 * Translate a key in the current language
 */
function t(key) {
  var trans = TRANSLATIONS[currentLang] || TRANSLATIONS['fr'];
  var val   = trans[key];
  if (val === undefined) val = (TRANSLATIONS['fr'] || {})[key];
  if (typeof val === 'function') return val;
  return val !== undefined ? val : key;
}

/**
 * Translate a group name (with fallback to original name)
 */
function tGroup(name) {
  // MAP directe: nom interne FR → clé de traduction
  var GROUP_KEY_MAP = {
    'VPN / Réseau':       'group_vpn_reseau',
    'Bases de données':   'group_bases_de_donnees',
    'Proxy & SSL':        'group_proxy_ssl',
    'IA & LLM':           'group_ia_llm',
    'Applications web':   'group_applications_web',
    'Monitoring':         'group_monitoring',
    'Serveurs média':     'group_serveurs_media',
    'Gestion médias':     'group_gestion_medias',
    'Téléchargement':     'group_telechargement',
    'Fichiers & Sync':    'group_fichiers_sync',
    'Outils':             'group_outils',
    'DNS & AdBlock':      'group_dns_adblock',
    'Auth':               'group_auth',
    'Domotique':          'group_domotique',
  };
  var key = GROUP_KEY_MAP[name];
  if (key) {
    var trans = TRANSLATIONS[currentLang] || TRANSLATIONS['fr'];
    return trans[key] || name;
  }
  // Fallback: essai par normalisation
  var normKey = 'group_' + (name || '').toLowerCase()
    .replace(/[àâä]/g,'a').replace(/[éèêë]/g,'e')
    .replace(/[îï]/g,'i').replace(/[ôö]/g,'o').replace(/[ùûü]/g,'u')
    .replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  var trans2 = TRANSLATIONS[currentLang] || TRANSLATIONS['fr'];
  return trans2[normKey] || name;
}

/**
 * Apply translations to all [data-i18n] elements in the DOM
 */
function applyTranslations() {
  // Éléments avec data-i18n → textContent (sauf boutons avec icône FA gérés ci-dessous)
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.dataset.i18n;
    var val = t(key);
    if (typeof val !== 'string') return;
    var tag = el.tagName;
    // Boutons avec icône FA: traités séparément ci-dessous
    if (tag === 'BUTTON' && el.querySelector('i.fa, i.fas, i.far')) return;
    if (tag === 'INPUT' && (el.type === 'text' || el.type === 'number')) {
      el.placeholder = val;
    } else if (tag === 'OPTION') {
      el.textContent = val;
    } else {
      el.textContent = val;
    }
  });

  // Éléments avec data-i18n-placeholder → placeholder uniquement
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    var key = el.dataset.i18nPlaceholder;
    var val = t(key);
    if (typeof val === 'string') el.placeholder = val;
  });

  // Boutons avec icône FA: préserver l'icône, traduire le texte
  document.querySelectorAll('button[data-i18n]').forEach(function(btn) {
    var key = btn.dataset.i18n;
    var val = t(key);
    if (typeof val !== 'string') return;
    // Si le bouton contient une icône FA, la préserver
    var icon = btn.querySelector('i.fa, i.fas, i.far');
    if (icon) {
      // Remplacer uniquement les text nodes
      var nodes = btn.childNodes;
      for (var n = nodes.length - 1; n >= 0; n--) {
        if (nodes[n].nodeType === 3) btn.removeChild(nodes[n]); // text node
      }
      btn.appendChild(document.createTextNode(' ' + val));
    } else {
      btn.textContent = val;
    }
  });

  // Mettre à jour le title du bouton aide
  var helpBtn = document.getElementById('btn-help');
  if (helpBtn) helpBtn.title = t('help_btn_title');
}

/**
 * Change language, save to cookie, reapply translations
 */
function setLang(lang) {
  if (!TRANSLATIONS[lang]) return;
  // Sauvegarder la langue dans le cookie
  document.cookie = 'lang=' + lang + '; path=/; max-age=31536000';
  // Recharger la page pour appliquer toutes les traductions proprement
  // (les textes générés par render() et les éléments dynamiques)
  window.location.reload();
}
