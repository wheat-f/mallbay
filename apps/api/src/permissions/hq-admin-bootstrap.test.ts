import assert from "node:assert/strict";
import test from "node:test";
import { ensureHeadquartersAdminRole } from "./hq-admin-bootstrap";

test("HQ bootstrap only ensures the system role and never restores grants", async () => {
  let grantsTouched = false;
  const role = await ensureHeadquartersAdminRole({
    permissionRole: {
      upsert: async () => ({ id: "hq-role", code: "HQ_ADMIN" })
    },
    permissionRoleGrant: {
      upsert: async () => {
        grantsTouched = true;
      }
    }
  } as never);

  assert.equal(role.code, "HQ_ADMIN");
  assert.equal(grantsTouched, false);
});
