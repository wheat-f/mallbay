# Policy publication preserves headquarters recovery

`permissions.policy:publish` is a dedicated global capability. A policy version cannot be published unless `HQ_ADMIN` retains that capability at global scope. The invariant prevents a policy change from removing the only supported path for headquarters administrators to inspect, revise, or roll back access governance. Bootstrap still ensures only the system role and its headquarters binding; the published policy remains responsible for the grant itself.
