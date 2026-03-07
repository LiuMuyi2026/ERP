"""
Default pipeline configuration — hardcoded fallback values.

Every field in the pipeline config has a default here, ensuring zero-risk
backwards compatibility. These are used:
  1. When seeding a new tenant's workflow_templates.definition
  2. As fallback when a config field is missing from the DB
"""

DEFAULT_PIPELINE_DEFINITION: dict = {
    "pipeline": {
        "stages": [
            {"key": "sales", "label": "销售跟进", "labelKey": "stageSales", "icon": "briefcase", "color": "#7c3aed", "bg": "#f5f3ff"},
            {"key": "contract", "label": "合同签订", "labelKey": "stageContract", "icon": "document-pen", "color": "#0284c7", "bg": "#e0f2fe"},
            {"key": "procurement", "label": "采购生产", "labelKey": "stageProcurement", "icon": "factory", "color": "#c2410c", "bg": "#fff7ed"},
            {"key": "booking", "label": "订舱物流", "labelKey": "stageBooking", "icon": "ship", "color": "#15803d", "bg": "#f0fdf4"},
            {"key": "shipping", "label": "发货运输", "labelKey": "stageShipping", "icon": "package", "color": "#d97706", "bg": "#fffbeb"},
            {"key": "collection", "label": "收款结算", "labelKey": "stageCollection", "icon": "money-bag", "color": "#059669", "bg": "#d1fae5"},
        ],
    },
    "statuses": {
        "values": [
            {"key": "inquiry", "label": "询盘", "color": "bg-indigo-100 text-indigo-700", "stage": "sales"},
            {"key": "new", "label": "新线索", "color": "bg-indigo-100 text-indigo-700", "stage": "sales"},
            {"key": "replied", "label": "已回复", "color": "bg-teal-100 text-teal-700", "stage": "sales"},
            {"key": "engaged", "label": "已互动", "color": "bg-teal-100 text-teal-700", "stage": "sales"},
            {"key": "qualified", "label": "已验证", "color": "bg-purple-100 text-purple-700", "stage": "sales"},
            {"key": "contacted", "label": "已联系", "color": "bg-teal-100 text-teal-700", "stage": "sales"},
            {"key": "quoted", "label": "已报价", "color": "bg-sky-100 text-sky-700", "stage": "contract"},
            {"key": "negotiating", "label": "谈判中", "color": "bg-blue-100 text-blue-700", "stage": "contract"},
            {"key": "procuring", "label": "采购中", "color": "bg-orange-100 text-orange-700", "stage": "procurement"},
            {"key": "booking", "label": "订舱中", "color": "bg-green-100 text-green-700", "stage": "booking"},
            {"key": "fulfillment", "label": "履约中", "color": "bg-amber-100 text-amber-700", "stage": "shipping"},
            {"key": "payment", "label": "收款中", "color": "bg-emerald-100 text-emerald-700", "stage": "collection"},
            {"key": "converted", "label": "已成交", "color": "bg-green-100 text-green-800", "stage": "collection"},
            {"key": "cold", "label": "冷线索", "color": "bg-gray-100 text-gray-500", "stage": None},
            {"key": "lost", "label": "已流失", "color": "bg-gray-100 text-gray-500", "stage": None},
        ],
        "status_to_stage": {
            "inquiry": "sales", "new": "sales", "replied": "sales",
            "engaged": "sales", "qualified": "sales", "contacted": "sales",
            "quoted": "contract", "negotiating": "contract",
            "procuring": "procurement",
            "booking": "booking",
            "fulfillment": "shipping",
            "payment": "collection", "converted": "collection",
        },
        "transitions": {
            "inquiry": "quoted",
            "new": "quoted",
            "replied": "quoted",
            "contacted": "quoted",
            "quoted": "negotiating",
            "negotiating": "procuring",
            "procuring": "booking",
            "booking": "fulfillment",
            "fulfillment": "payment",
            "payment": "converted",
        },
        "rank": ["new", "inquiry", "quoted", "negotiating", "fulfillment", "won"],
    },
    "operation_tasks": [
        {"code": "factory_inspection", "title": "出厂验货（厂检）", "owner_role": "业务员", "requires_attachment": True},
        {"code": "statutory_inspection", "title": "法检/商检预约与跟进", "owner_role": "单证员", "requires_attachment": True},
        {"code": "packing_details", "title": "催要货物明细并制作分箱明细", "owner_role": "单证员", "requires_attachment": True},
        {"code": "purchase_inbound", "title": "高达采购入库登记", "owner_role": "单证员", "requires_attachment": False},
        {"code": "final_payment_invoice", "title": "付尾款、发票核验与登记", "owner_role": "单证员/出纳员", "requires_attachment": True},
        {"code": "delivery_notice", "title": "送货通知签字并发送供应商", "owner_role": "业务员/单证员", "requires_attachment": True},
        {"code": "godad_billing", "title": "发货当月高达开单", "owner_role": "单证员", "requires_attachment": False},
        {"code": "goods_receipt_confirmation", "title": "确认接货数量与包装质量", "owner_role": "业务员", "requires_attachment": True},
        {"code": "customs_declaration", "title": "报关资料制作与发送货代", "owner_role": "单证员", "requires_attachment": True},
        {"code": "clearance_and_photos", "title": "确认通关并索要装箱/装船照片", "owner_role": "业务员/单证员", "requires_attachment": True},
        {"code": "shipment_notice", "title": "开船后2个工作日内制作装船通知", "owner_role": "单证员", "requires_attachment": True},
        {"code": "docs_preparation", "title": "议付单据与附件制作并发送业务员", "owner_role": "单证员", "requires_attachment": True},
        {"code": "docs_tracking", "title": "交单跟踪登记《TRACKING》", "owner_role": "单证员", "requires_attachment": True},
        {"code": "payment_followup", "title": "回款/LC到款跟进", "owner_role": "业务员/单证员/出纳员", "requires_attachment": True},
        {"code": "eta_reminder", "title": "ETA前7天到港提醒", "owner_role": "业务员", "requires_attachment": False},
        {"code": "satisfaction_survey", "title": "到港15天满意度回访", "owner_role": "业务员/单证员", "requires_attachment": False},
        {"code": "archive_evidence", "title": "电子归档与纸质归档", "owner_role": "业务员/单证员/财务", "requires_attachment": True},
    ],
    "approval_rules": [
        {
            "action": "delivery_notice",
            "conditions": [
                {"field": "sale_amount_usd", "operator": ">", "value": 300000},
                {"field": "sale_amount_cny", "operator": ">", "value": 2000000},
                {"field": "shipping_conditions_met", "operator": "==", "value": False},
            ],
            "condition_logic": "any",
            "level": "medium",
            "default_approver": "业务经理",
        },
        {
            "action": "ship_customs",
            "conditions": [
                {"field": "shipping_conditions_met", "operator": "==", "value": False},
            ],
            "condition_logic": "any",
            "level": "high",
            "approver_thresholds": [
                {"usd": 100000, "cny": 700000, "approver": "总经理（风控经理上报）"},
            ],
            "default_approver": "业务经理",
        },
        {
            "action": "release_goods",
            "conditions": [
                {"field": "outstanding_receivable_usd", "operator": ">", "value": 0},
                {"field": "outstanding_receivable_cny", "operator": ">", "value": 0},
            ],
            "condition_logic": "any",
            "level": "high",
            "approver_thresholds": [
                {"usd": 100000, "cny": 700000, "approver": "总经理（风控经理上报）"},
            ],
            "default_approver": "业务经理",
        },
    ],
    "file_categories": [
        {"key": "contract", "label": "合同", "color": "bg-blue-100 text-blue-700"},
        {"key": "quotation", "label": "报价单", "color": "bg-purple-100 text-purple-700"},
        {"key": "inspection", "label": "验货", "color": "bg-orange-100 text-orange-700"},
        {"key": "shipping", "label": "物流", "color": "bg-green-100 text-green-700"},
        {"key": "invoice", "label": "发票", "color": "bg-yellow-100 text-yellow-700"},
        {"key": "correspondence", "label": "函件", "color": "bg-teal-100 text-teal-700"},
        {"key": "other", "label": "其他", "color": "bg-gray-100 text-gray-600"},
    ],
    "role_mappings": {
        "业务员": "salesperson",
        "单证员": "documentation_clerk",
        "出纳员": "cashier",
        "业务经理": "sales_manager",
        "总经理（风控经理上报）": "general_manager",
    },
}
