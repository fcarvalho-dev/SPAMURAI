from models.schema import PlanType

PLAN_FEATURES: dict[PlanType, dict[str, bool | int]] = {
    PlanType.free: {
        "ai_classify": False,
        "kenzo_chat": False,
        "auto_rules": False,
        "auto_sync": False,
        "voice_stt": False,
        "reports": False,
        "subscription_monitor": False,
        "multi_account": False,
        "max_monitored_subscriptions": 0,
    },
    PlanType.pro: {
        "ai_classify": True,
        "kenzo_chat": True,
        "auto_rules": True,
        "auto_sync": True,
        "voice_stt": True,
        "reports": True,
        "subscription_monitor": True,
        "multi_account": False,
        "max_monitored_subscriptions": 10,
    },
    PlanType.business: {
        "ai_classify": True,
        "kenzo_chat": True,
        "auto_rules": True,
        "auto_sync": True,
        "voice_stt": True,
        "reports": True,
        "subscription_monitor": True,
        "multi_account": True,
        "max_monitored_subscriptions": -1,  # ilimitado
    },
}


def has_feature(plan: PlanType, feature: str) -> bool:
    value = PLAN_FEATURES.get(plan, {}).get(feature, False)
    return bool(value)


def require_feature(plan: PlanType, feature: str) -> None:
    from fastapi import HTTPException
    if not has_feature(plan, feature):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "plan_required",
                "feature": feature,
                "message": "Esta funcionalidade requer o plano Pro ou superior.",
                "upgrade_url": "/settings/plans",
            },
        )
