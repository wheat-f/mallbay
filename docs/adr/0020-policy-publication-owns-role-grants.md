# Policy publication owns role grants

Only a validated and published permission policy may add, remove, or change `PermissionRoleGrant` records, including grants for `HQ_ADMIN`. Deployment bootstrap may ensure the `HQ_ADMIN` system role and its unique HQ-scoped binding exist, but it must not restore a static permission list. This preserves the authority of policy impact analysis, revocation, and rollback; the rejected alternative was a static deployment-time grant floor, which silently re-granted permissions after a published revocation.
