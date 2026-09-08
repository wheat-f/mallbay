# Headquarters and store settings have fixed scopes

Headquarters governance and headquarters dictionary templates are separate global capabilities. Store dictionaries, store profile, operations, notifications, capacity, and finance configuration are separate store-scoped capabilities. MallBay does not use a shared settings capability whose scope is inferred from request parameters. Fixed capability scopes make global-versus-store intent explicit in policy review and prevent a store role grant from becoming an accidental headquarters administration grant.
