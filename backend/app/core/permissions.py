"""Role-Based Access Control — permission matrix and helpers.

The RBAC matrix mirrors STEP4 §4.2.  Permissions are stored in the JWT
payload as a list of strings, so checking is O(1) set lookup.

FastAPI dependency wiring (get_current_user, require_permission) lives in
dependencies.py (6A-7) — this module is pure logic, no FastAPI imports.
"""

# ---------------------------------------------------------------------------
# Permission constants (used as dict keys AND JWT claim values)
# ---------------------------------------------------------------------------

PERM_USER_MANAGE = "user_manage"
PERM_ROLE_MANAGE = "role_manage"
PERM_SUPPLIER_MANAGE = "supplier_manage"
PERM_STOCK_IN = "stock_in"
PERM_ROLL_CUT = "roll_cut"
PERM_LOT_MANAGE = "lot_manage"
PERM_BATCH_CREATE = "batch_create"
PERM_BATCH_ASSIGN = "batch_assign"
PERM_BATCH_START = "batch_start"
PERM_BATCH_SUBMIT = "batch_submit"
PERM_BATCH_CHECK = "batch_check"
PERM_INVENTORY_VIEW = "inventory_view"
PERM_INVENTORY_ADJUST = "inventory_adjust"
PERM_ORDER_MANAGE = "order_manage"
PERM_INVOICE_MANAGE = "invoice_manage"
PERM_REPORT_VIEW = "report_view"
PERM_BATCH_SEND_VA = "batch_send_va"
PERM_BATCH_RECEIVE_VA = "batch_receive_va"
PERM_BATCH_READY_PACKING = "batch_ready_packing"
PERM_BATCH_PACK = "batch_pack"

ALL_PERMISSIONS: list[str] = [
    PERM_USER_MANAGE,
    PERM_ROLE_MANAGE,
    PERM_SUPPLIER_MANAGE,
    PERM_STOCK_IN,
    PERM_ROLL_CUT,
    PERM_LOT_MANAGE,
    PERM_BATCH_CREATE,
    PERM_BATCH_ASSIGN,
    PERM_BATCH_START,
    PERM_BATCH_SUBMIT,
    PERM_BATCH_CHECK,
    PERM_BATCH_SEND_VA,
    PERM_BATCH_RECEIVE_VA,
    PERM_BATCH_READY_PACKING,
    PERM_BATCH_PACK,
    PERM_INVENTORY_VIEW,
    PERM_INVENTORY_ADJUST,
    PERM_ORDER_MANAGE,
    PERM_INVOICE_MANAGE,
    PERM_REPORT_VIEW,
]

# ---------------------------------------------------------------------------
# Role → permissions mapping  (STEP4 §4.2 RBAC table)
# ---------------------------------------------------------------------------

ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": [
        PERM_USER_MANAGE,
        PERM_ROLE_MANAGE,
        PERM_SUPPLIER_MANAGE,
        PERM_STOCK_IN,
        PERM_LOT_MANAGE,
        PERM_BATCH_SEND_VA,
        PERM_BATCH_RECEIVE_VA,
        PERM_BATCH_READY_PACKING,
        PERM_BATCH_PACK,
        PERM_INVENTORY_VIEW,
        PERM_INVENTORY_ADJUST,
        PERM_ORDER_MANAGE,
        PERM_INVOICE_MANAGE,
        PERM_REPORT_VIEW,
    ],
    "supervisor": [
        PERM_SUPPLIER_MANAGE,
        PERM_STOCK_IN,
        PERM_ROLL_CUT,
        PERM_LOT_MANAGE,
        PERM_BATCH_CREATE,
        PERM_BATCH_ASSIGN,
        PERM_BATCH_SEND_VA,
        PERM_BATCH_RECEIVE_VA,
        PERM_BATCH_READY_PACKING,
        PERM_BATCH_PACK,
        PERM_INVENTORY_VIEW,
        PERM_INVENTORY_ADJUST,
        PERM_REPORT_VIEW,
    ],
    "tailor": [
        PERM_BATCH_START,
        PERM_BATCH_SUBMIT,
    ],
    "checker": [
        PERM_BATCH_CHECK,
        PERM_BATCH_READY_PACKING,
    ],
    "billing": [
        PERM_INVENTORY_VIEW,
        PERM_ORDER_MANAGE,
        PERM_INVOICE_MANAGE,
        PERM_REPORT_VIEW,
    ],
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_role_permissions(role_name: str) -> dict[str, bool]:
    """Return the full permission map for a role (all 15 keys, True/False).

    Used during login to embed in JWT and return in the auth response.
    """
    granted = set(ROLE_PERMISSIONS.get(role_name, []))
    return {perm: perm in granted for perm in ALL_PERMISSIONS}


def get_role_permission_list(role_name: str) -> list[str]:
    """Return only the granted permission names for a role.

    Used to build the JWT 'permissions' claim.
    """
    return list(ROLE_PERMISSIONS.get(role_name, []))


def check_permission(role: str, permission: str) -> bool:
    """Check if a role has a specific permission."""
    return permission in ROLE_PERMISSIONS.get(role, [])


def check_permission_from_claims(permissions: list[str], required: str) -> bool:
    """Check if a JWT permissions claim list includes the required permission."""
    return required in permissions
