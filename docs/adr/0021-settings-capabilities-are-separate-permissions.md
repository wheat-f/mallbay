# Settings capabilities are separate permissions

MallBay models each settings responsibility as its own permission code and action set rather than granting generic `settings:read/write`. Permission policy management, HQ dictionary templates, store dictionaries, member management, store profile and operations, and finance settings have distinct authorization points and scopes. This follows the existing settings capability catalogue and prevents a low-risk configuration grant from implicitly authorizing unrelated people, data, or governance operations.
