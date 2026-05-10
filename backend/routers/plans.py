import structlog
from fastapi import APIRouter, Depends, Request

from core.plans import PLAN_FEATURES
from models.schema import PlanType, User
from routers.gmail import FREE_DELETION_LIMIT, get_current_user

logger = structlog.get_logger()
router = APIRouter(prefix="/plans", tags=["plans"])


@router.get("/current")
async def get_current_plan(
    current_user: User = Depends(get_current_user),
):
    is_free = current_user.plan == PlanType.free
    return {
        "plan": current_user.plan,
        "billing_cycle": current_user.billing_cycle,
        "plan_started_at": current_user.plan_started_at.isoformat()
        if current_user.plan_started_at
        else None,
        "plan_expires_at": current_user.plan_expires_at.isoformat()
        if current_user.plan_expires_at
        else None,
        "features": PLAN_FEATURES[current_user.plan],
        "usage": {
            "deletions_this_month": current_user.deletions_this_month if is_free else None,
            "deletions_limit": FREE_DELETION_LIMIT if is_free else None,
            "deletions_reset_at": current_user.deletions_month_reset.isoformat()
            if current_user.deletions_month_reset
            else None,
        },
    }


@router.get("/available")
async def get_available_plans():
    return {
        "plans": [
            {
                "id": "free",
                "name": "Free",
                "price_monthly": 0,
                "price_weekly": 0,
                "features": PLAN_FEATURES[PlanType.free],
            },
            {
                "id": "pro",
                "name": "Pro",
                "price_monthly": 19.00,
                "price_weekly": 6.00,
                "features": PLAN_FEATURES[PlanType.pro],
                "popular": True,
            },
            {
                "id": "business",
                "name": "Business",
                "price_monthly": 49.00,
                "price_weekly": 15.00,
                "features": PLAN_FEATURES[PlanType.business],
            },
        ]
    }
