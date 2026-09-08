# Membership roles are explicit and stable

Creating or inviting a member must persist an explicit `PermissionRoleBinding`. The product may suggest an initial role from the member's business position, but the suggestion has no authority until the binding is saved. Changing `StoreMember.position` does not alter role bindings; a role change is a separate, audited operation. Members without an active binding receive no business permissions. This removes implicit privilege changes from ordinary personnel-data edits while retaining convenient role defaults during membership administration.
