from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, Any, List
from app.deps import get_current_user_with_tenant
from app.utils.sql import build_update_clause
import uuid
import json
import os
import aiofiles
import mimetypes
import secrets
import time
import re
from datetime import datetime, timedelta

router = APIRouter(prefix="/workspace", tags=["workspace"])


# ── Pydantic models ────────────────────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    name: str
    visibility: str = "private"   # "private" | "team"
    icon: Optional[str] = None
    description: Optional[str] = None


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    visibility: Optional[str] = None
    icon: Optional[str] = None
    description: Optional[str] = None
    position: Optional[float] = None


class PageCreate(BaseModel):
    workspace_id: str
    parent_page_id: Optional[str] = None
    title: str = "Untitled"
    content: Optional[dict] = None
    position: float = 0.0
    icon: Optional[str] = None


class PageUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[Any] = None
    position: Optional[float] = None
    icon: Optional[str] = None
    cover_emoji: Optional[str] = None
    is_archived: Optional[bool] = None
    is_template: Optional[bool] = None
    template_category: Optional[str] = None


class PageFromTemplate(BaseModel):
    workspace_id: str
    parent_page_id: Optional[str] = None
    title: Optional[str] = None


class WorkspaceMemberAdd(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None
    role: str = "editor"   # viewer | editor | admin


class CopyPageBody(BaseModel):
    target_workspace_id: str
    title: Optional[str] = None   # override title, else use original


class SaveAsTemplateBody(BaseModel):
    category: str = "Custom"
    description: str = ""
    title: Optional[str] = None
    mode: str = "clone"  # clone | convert


class TemplateApplyBody(BaseModel):
    template_id: str
    lang: str = "en"
    mode: str = "replace"  # replace | append


class TemplateButtonCreate(BaseModel):
    label: Optional[str] = None
    template_id: str
    apply_mode: str = "append"  # append | replace


class TemplateButtonRunBody(BaseModel):
    lang: str = "en"


class TemplateButtonReorderBody(BaseModel):
    ordered_ids: List[str]


class TemplateButtonUpdateBody(BaseModel):
    label: Optional[str] = None
    apply_mode: Optional[str] = None  # append | replace


# ── Built-in templates ─────────────────────────────────────────────────────────

def get_builtin_templates(lang: str = "en"):
    zh = lang.startswith("zh")

    def L(en_val, zh_val):
        return zh_val if zh else en_val

    def COL(key, en_title, zh_title):
        return {"key": key, "title": L(en_title, zh_title)}

    def ROW(**kwargs):
        return kwargs

    def TASK(id_, en_title, zh_title, status="todo", priority=None, en_desc=None, zh_desc=None):
        return {
            "id": id_,
            "title": L(en_title, zh_title),
            "status": status,
            "priority": priority,
            "assignees": [],
            "due_date": None,
            "subtasks": [],
            "attachments": [],
            "task_type": None,
            "description": L(en_desc, zh_desc) if en_desc else None,
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
        }

    cat = {
        "meeting":     L("Meeting",     "会议"),
        "planning":    L("Planning",    "规划"),
        "personal":    L("Personal",    "个人"),
        "product":     L("Product",     "产品"),
        "engineering": L("Engineering", "工程"),
        "business":    L("Business",    "商务"),
        "marketing":   L("Marketing",   "市场"),
        "hr":          L("HR",          "人事"),
    }

    return [
        # ── 1. Meeting Notes ───────────────────────────────────────────────────
        {
            "id": "tpl-meeting-notes",
            "title": L("Meeting Notes", "会议纪要"),
            "icon": "📋",
            "category": cat["meeting"],
            "description": L(
                "Agenda, notes & action items",
                "议程、笔记、行动项",
            ),
            "content": {"text": L(
                "## Meeting Notes\n\n**Date:** \n**Time:** \n**Location / Link:** \n**Facilitator:** \n\n---\n\n## Agenda\n\n1. Review previous action items\n2. \n3. \n4. Open discussion\n\n---\n\n## Discussion Notes\n\n### Topic 1\n\n\n\n### Topic 2\n\n\n\n---\n\n## Decisions Made\n\n- \n\n---\n\n## Next Meeting\n\n**Date:** \n**Agenda:** \n",
                "## 会议纪要\n\n**日期:** \n**时间:** \n**地点/链接:** \n**主持人:** \n\n---\n\n## 议程\n\n1. 上次行动项跟进\n2. \n3. \n4. 自由讨论\n\n---\n\n## 讨论记录\n\n### 话题一\n\n\n\n### 话题二\n\n\n\n---\n\n## 决议事项\n\n- \n\n---\n\n## 下次会议\n\n**日期:** \n**拟定议程:** \n",
            )},
            "default_views": [
                {"id": "notes", "type": "document", "title": L("Notes", "笔记"), "icon": "📝",
                 "data": {"text": L(
                     "## Meeting Notes\n\n**Date:** \n**Time:** \n**Location / Link:** \n**Facilitator:** \n**Attendees:** *(see Attendees tab)*\n\n---\n\n## Agenda\n\n1. Review previous action items\n2. \n3. \n4. Open discussion\n\n---\n\n## Discussion Notes\n\n### 1. Previous Action Items\n\n*Status update on items from the last meeting.*\n\n### 2. \n\n\n\n### 3. \n\n\n\n---\n\n## Decisions Made\n\n- \n\n## Risks & Blockers\n\n> ⚠️ Document any blockers raised during the meeting.\n\n---\n\n## Next Meeting\n\n**Date:** \n**Proposed Agenda:** \n",
                     "## 会议纪要\n\n**日期:** \n**时间:** \n**地点/链接:** \n**主持人:** \n**参会人员:** *(见参会人员标签页)*\n\n---\n\n## 议程\n\n1. 上次行动项跟进\n2. \n3. \n4. 自由讨论\n\n---\n\n## 讨论记录\n\n### 1. 上次行动项回顾\n\n*对上次会议行动项进行进展更新。*\n\n### 2. \n\n\n\n### 3. \n\n\n\n---\n\n## 决议事项\n\n- \n\n## 风险与阻碍\n\n> ⚠️ 记录会议中提出的阻碍项。\n\n---\n\n## 下次会议\n\n**日期:** \n**拟定议程:** \n",
                 )}},
                {"id": "attendees", "type": "table", "title": L("Attendees", "参会人员"), "icon": "👥",
                 "columns": [COL("name", "Name", "姓名"), COL("role", "Role", "角色"),
                             COL("email", "Email", "邮箱"), COL("status", "Status", "状态")],
                 "rows": [
                     ROW(name=L("Alice Chen", "陈爱丽"), role=L("Product Manager", "产品经理"), email="alice@company.com", status=L("Required", "必须参加")),
                     ROW(name=L("Bob Liu", "刘波"), role=L("Engineering Lead", "工程负责人"), email="bob@company.com", status=L("Required", "必须参加")),
                     ROW(name=L("Carol Zhang", "张卡洛"), role=L("Designer", "设计师"), email="carol@company.com", status=L("Optional", "可选参加")),
                 ]},
                {"id": "actions", "type": "task_tracker", "title": L("Action Items", "行动项"), "icon": "✅",
                 "data": {"_tasks": [
                     TASK("mt1", "Send meeting summary to all attendees", "发送会议纪要给所有参会人员", priority="high"),
                     TASK("mt2", "Follow up on blockers raised in the meeting", "跟进会议中提出的阻碍项", priority="medium"),
                     TASK("mt3", "Schedule next meeting and confirm attendees", "安排下次会议并确认参会人", priority="low"),
                 ]}},
            ],
        },

        # ── 2. Project Brief ───────────────────────────────────────────────────
        {
            "id": "tpl-project-brief",
            "title": L("Project Brief", "项目简介"),
            "icon": "📝",
            "category": cat["planning"],
            "description": L(
                "Scope, goals & milestones",
                "范围、目标、里程碑",
            ),
            "content": {"text": L(
                "## Project Brief\n\n**Project Name:** \n**Owner:** \n**Start Date:** \n**Target Launch:** \n**Status:** Planning\n\n---\n\n## Executive Summary\n\n[2-3 sentences describing the project, purpose, and expected impact]\n\n---\n\n## Problem Statement\n\nWhat problem are we solving? Who is affected?\n\n---\n\n## Goals & Success Metrics\n\n| Goal | Success Metric | Target |\n|------|---------------|--------|\n|      |               |        |\n\n---\n\n## Scope\n\n### In Scope\n- \n\n### Out of Scope\n- \n\n---\n\n## Risks & Mitigations\n\n| Risk | Impact | Mitigation |\n|------|--------|------------|\n|      |        |            |\n",
                "## 项目简介\n\n**项目名称:** \n**负责人:** \n**开始日期:** \n**目标上线:** \n**状态:** 规划中\n\n---\n\n## 执行摘要\n\n[2-3句话描述项目、目的与预期影响]\n\n---\n\n## 问题陈述\n\n我们要解决什么问题？影响哪些用户？\n\n---\n\n## 目标与成功指标\n\n| 目标 | 成功指标 | 目标值 |\n|------|---------|--------|\n|      |         |        |\n\n---\n\n## 范围\n\n### 范围内\n- \n\n### 范围外\n- \n\n---\n\n## 风险与应对\n\n| 风险 | 影响 | 应对措施 |\n|------|------|---------|\n|      |      |         |\n",
            )},
            "default_views": [
                {"id": "brief", "type": "document", "title": L("Brief", "简介"), "icon": "📝",
                 "data": {"text": L(
                     "## Project Brief\n\n**Project Name:** \n**Owner:** \n**Start Date:** \n**Target Launch:** \n**Status:** Planning\n\n---\n\n## Executive Summary\n\n[2-3 sentences describing the project, its purpose and expected impact]\n\n---\n\n## Problem Statement\n\nWhat problem are we solving? Who is affected, and how significantly?\n\n---\n\n## Goals & Success Metrics\n\n| Goal | Success Metric | Target |\n|------|---------------|--------|\n|      |               |        |\n|      |               |        |\n\n---\n\n## Scope\n\n### In Scope\n- \n\n### Out of Scope\n- \n\n---\n\n## Stakeholders\n\n| Name | Role | Responsibility |\n|------|------|---------------|\n|      |      |               |\n\n---\n\n## Risks & Mitigations\n\n| Risk | Likelihood | Impact | Mitigation |\n|------|-----------|--------|------------|\n|      |           |        |            |\n",
                     "## 项目简介\n\n**项目名称:** \n**负责人:** \n**开始日期:** \n**目标上线:** \n**状态:** 规划中\n\n---\n\n## 执行摘要\n\n[2-3句话描述项目、目的与预期影响]\n\n---\n\n## 问题陈述\n\n我们要解决什么问题？影响哪些用户，影响有多大？\n\n---\n\n## 目标与成功指标\n\n| 目标 | 成功指标 | 目标值 |\n|------|---------|--------|\n|      |         |        |\n|      |         |        |\n\n---\n\n## 范围\n\n### 范围内\n- \n\n### 范围外\n- \n\n---\n\n## 干系人\n\n| 姓名 | 角色 | 职责 |\n|------|------|------|\n|      |      |      |\n\n---\n\n## 风险与应对\n\n| 风险 | 可能性 | 影响 | 应对措施 |\n|------|--------|------|---------|\n|      |        |      |         |\n",
                 )}},
                {"id": "milestones", "type": "table", "title": L("Milestones", "里程碑"), "icon": "🎯",
                 "columns": [COL("milestone", "Milestone", "里程碑"), COL("date", "Target Date", "目标日期"),
                             COL("owner", "Owner", "负责人"), COL("status", "Status", "状态")],
                 "rows": [
                     ROW(milestone=L("Requirements finalized", "需求确认完成"), date="", owner="", status=L("Planned", "计划中")),
                     ROW(milestone=L("Design approved", "设计稿通过"), date="", owner="", status=L("Planned", "计划中")),
                     ROW(milestone=L("Development complete", "开发完成"), date="", owner="", status=L("Planned", "计划中")),
                     ROW(milestone=L("Launch", "正式上线"), date="", owner="", status=L("Planned", "计划中")),
                 ]},
                {"id": "tasks", "type": "task_tracker", "title": L("Tasks", "任务"), "icon": "✅",
                 "data": {"_tasks": [
                     TASK("pb1", "Write requirements document", "编写需求文档", priority="high"),
                     TASK("pb2", "Identify and align stakeholders", "识别并对齐干系人", priority="high"),
                     TASK("pb3", "Create project timeline and milestones", "制定项目时间表与里程碑", priority="medium"),
                     TASK("pb4", "Set up project tracking workspace", "设置项目追踪工作区", priority="medium"),
                     TASK("pb5", "Kick-off meeting with full team", "与全团队召开启动会", priority="high"),
                 ]}},
            ],
        },

        # ── 3. OKR Planning ────────────────────────────────────────────────────
        {
            "id": "tpl-okr",
            "title": L("OKR Planning", "OKR 规划"),
            "icon": "🎯",
            "category": cat["planning"],
            "description": L(
                "OKRs & key results tracking",
                "OKR 目标追踪",
            ),
            "content": {"text": L(
                "## OKR — Q[N] [Year]\n\n**Team/Owner:** \n**Period:** \n\n---\n\n## Objective 1\n\n> [Inspiring goal statement]\n\n### Key Results\n\n- **KR1:** from X → Y by [date]\n- **KR2:** from X → Y by [date]\n- **KR3:** from X → Y by [date]\n\n---\n\n## Objective 2\n\n> \n\n### Key Results\n\n- **KR1:** \n- **KR2:** \n",
                "## OKR — Q[N] [年份]\n\n**团队/负责人:** \n**周期:** \n\n---\n\n## 目标 1\n\n> [激励人心的目标陈述]\n\n### 关键结果\n\n- **KR1:** 从 X → Y，截止 [日期]\n- **KR2:** 从 X → Y，截止 [日期]\n- **KR3:** 从 X → Y，截止 [日期]\n\n---\n\n## 目标 2\n\n> \n\n### 关键结果\n\n- **KR1:** \n- **KR2:** \n",
            )},
            "default_views": [
                {"id": "overview", "type": "document", "title": L("Overview", "概述"), "icon": "📝",
                 "data": {"text": L(
                     "## OKR — Q[N] [Year]\n\n**Team/Owner:** \n**Period:** \n**Review cadence:** Bi-weekly check-in\n\n---\n\n## How to use OKRs\n\nObjectives are ambitious, qualitative goals. Key Results are measurable outcomes that signal whether the objective is achieved. Aim for 60–70% completion — if you always hit 100%, your OKRs aren't ambitious enough.\n\n---\n\n## Objective 1\n\n> [Inspiring, qualitative goal statement]\n\n### Key Results\n\n- **KR1:** from [baseline] → [target] by [date] | Current: [value]\n- **KR2:** from [baseline] → [target] by [date] | Current: [value]\n- **KR3:** from [baseline] → [target] by [date] | Current: [value]\n\n---\n\n## Objective 2\n\n> \n\n### Key Results\n\n- **KR1:** \n- **KR2:** \n\n---\n\n## Objective 3\n\n> \n\n### Key Results\n\n- **KR1:** \n- **KR2:** \n",
                     "## OKR — Q[N] [年份]\n\n**团队/负责人:** \n**周期:** \n**回顾节奏:** 每两周对齐一次\n\n---\n\n## 如何使用 OKR\n\n目标（O）是雄心勃勃、定性化的方向。关键结果（KR）是可衡量的产出，用来判断目标是否达成。目标完成率建议在 60–70%，若每次都能100%完成，说明目标还不够有挑战性。\n\n---\n\n## 目标 1\n\n> [激励人心的定性目标陈述]\n\n### 关键结果\n\n- **KR1:** 从 [基准] → [目标] 截止 [日期] | 当前: [数值]\n- **KR2:** 从 [基准] → [目标] 截止 [日期] | 当前: [数值]\n- **KR3:** 从 [基准] → [目标] 截止 [日期] | 当前: [数值]\n\n---\n\n## 目标 2\n\n> \n\n### 关键结果\n\n- **KR1:** \n- **KR2:** \n\n---\n\n## 目标 3\n\n> \n\n### 关键结果\n\n- **KR1:** \n- **KR2:** \n",
                 )}},
                {"id": "okrs", "type": "table", "title": L("OKRs", "OKR 追踪"), "icon": "🎯",
                 "columns": [COL("objective", "Objective", "目标"), COL("key_result", "Key Result", "关键结果"),
                             COL("owner", "Owner", "负责人"), COL("baseline", "Baseline", "基准"),
                             COL("target", "Target", "目标值"), COL("current", "Current", "当前值"), COL("progress", "Progress %", "进度%")],
                 "rows": [
                     ROW(objective=L("Objective 1", "目标1"), key_result=L("KR1: ", "KR1: "), owner="", baseline="", target="", current="", progress="0%"),
                     ROW(objective=L("Objective 1", "目标1"), key_result=L("KR2: ", "KR2: "), owner="", baseline="", target="", current="", progress="0%"),
                     ROW(objective=L("Objective 2", "目标2"), key_result=L("KR1: ", "KR1: "), owner="", baseline="", target="", current="", progress="0%"),
                 ]},
                {"id": "initiatives", "type": "task_tracker", "title": L("Initiatives", "计划行动"), "icon": "🚀",
                 "data": {"_tasks": [
                     TASK("okr1", "Define OKRs with team and get sign-off", "与团队确定 OKR 并获得批准", priority="high"),
                     TASK("okr2", "Set up bi-weekly OKR check-in calendar", "建立每两周一次的 OKR 回顾日历", priority="medium"),
                     TASK("okr3", "Identify initiatives for each Key Result", "为每个关键结果确定行动计划", priority="high"),
                     TASK("okr4", "Share OKRs with stakeholders", "向干系人分享 OKR", priority="medium"),
                 ]}},
            ],
        },

        # ── 4. Weekly Review ───────────────────────────────────────────────────
        {
            "id": "tpl-weekly-review",
            "title": L("Weekly Review", "每周回顾"),
            "icon": "📅",
            "category": cat["personal"],
            "description": L(
                "Wins, blockers & priorities",
                "收获、阻碍、优先级",
            ),
            "content": {"text": L(
                "## Weekly Review — Week of [Date]\n\n---\n\n## Wins This Week 🎉\n\n- \n- \n\n---\n\n## What I Learned 🧠\n\n- \n\n---\n\n## Next Week Priorities\n\n1. \n2. \n3. \n",
                "## 每周回顾 — [日期]当周\n\n---\n\n## 本周收获 🎉\n\n- \n- \n\n---\n\n## 本周学到了什么 🧠\n\n- \n\n---\n\n## 下周优先级\n\n1. \n2. \n3. \n",
            )},
            "default_views": [
                {"id": "review", "type": "document", "title": L("Review", "回顾"), "icon": "📝",
                 "data": {"text": L(
                     "## Weekly Review — Week of [Date]\n\n---\n\n## Wins This Week 🎉\n\nWhat went well? What are you proud of?\n\n- \n- \n\n---\n\n## What I Learned 🧠\n\nInsights, lessons, things that surprised you.\n\n- \n\n---\n\n## Challenges & How I Handled Them\n\n- \n\n---\n\n## Energy Check\n\n**Overall energy this week:** ⚡⚡⚡⚡⚡ (1-5)\n**Stress level:** Low | Medium | High\n\n---\n\n## Next Week Focus\n\n**Top 3 priorities:**\n1. \n2. \n3. \n\n**What to delegate or drop:** \n",
                     "## 每周回顾 — [日期]当周\n\n---\n\n## 本周收获 🎉\n\n进展顺利的事情？值得骄傲的成就？\n\n- \n- \n\n---\n\n## 本周学到了什么 🧠\n\n洞察、经验教训、令你惊讶的事情。\n\n- \n\n---\n\n## 挑战与应对\n\n- \n\n---\n\n## 状态自查\n\n**本周整体精力:** ⚡⚡⚡⚡⚡ (1-5)\n**压力水平:** 低 | 中 | 高\n\n---\n\n## 下周重点\n\n**前三优先级:**\n1. \n2. \n3. \n\n**可以委派或暂缓的事:** \n",
                 )}},
                {"id": "priorities", "type": "table", "title": L("Priorities", "优先事项"), "icon": "🎯",
                 "columns": [COL("priority", "Priority", "优先事项"), COL("area", "Area", "领域"),
                             COL("status", "Status", "状态"), COL("energy", "Energy", "精力"), COL("notes", "Notes", "备注")],
                 "rows": [
                     ROW(priority=L("Priority 1", "优先事项1"), area=L("Work", "工作"), status=L("In Progress", "进行中"), energy=L("High", "高"), notes=""),
                     ROW(priority=L("Priority 2", "优先事项2"), area=L("Work", "工作"), status=L("Not started", "未开始"), energy=L("Medium", "中"), notes=""),
                     ROW(priority=L("Priority 3", "优先事项3"), area=L("Personal", "个人"), status=L("Not started", "未开始"), energy=L("Low", "低"), notes=""),
                 ]},
                {"id": "habits", "type": "table", "title": L("Habits", "习惯打卡"), "icon": "🌱",
                 "columns": [COL("habit", "Habit", "习惯"), COL("mon", "Mon", "周一"), COL("tue", "Tue", "周二"),
                             COL("wed", "Wed", "周三"), COL("thu", "Thu", "周四"), COL("fri", "Fri", "周五"),
                             COL("streak", "Streak", "连续天数")],
                 "rows": [
                     ROW(habit=L("Exercise 30min", "运动30分钟"), mon="", tue="", wed="", thu="", fri="", streak="0"),
                     ROW(habit=L("Read 20 pages", "阅读20页"), mon="", tue="", wed="", thu="", fri="", streak="0"),
                     ROW(habit=L("No screens after 10pm", "10点后不看屏幕"), mon="", tue="", wed="", thu="", fri="", streak="0"),
                 ]},
            ],
        },

        # ── 5. Product Spec ────────────────────────────────────────────────────
        {
            "id": "tpl-product-spec",
            "title": L("Product Spec", "产品需求文档"),
            "icon": "🚀",
            "category": cat["product"],
            "description": L(
                "User stories & feature spec",
                "用户故事、功能规格",
            ),
            "content": {"text": L(
                "## Product Spec: [Feature Name]\n\n**Author:** \n**Status:** Draft | Review | Approved\n**Last Updated:** \n\n---\n\n## Problem Statement\n\nWhat problem does this solve? Who is affected?\n\n---\n\n## Goals\n\n- \n\n## Non-Goals\n\n- \n\n---\n\n## Proposed Solution\n\nHigh-level description of the solution.\n",
                "## 产品需求文档: [功能名称]\n\n**作者:** \n**状态:** 草稿 | 评审中 | 已批准\n**最后更新:** \n\n---\n\n## 问题陈述\n\n我们要解决什么问题？影响哪些用户？\n\n---\n\n## 目标\n\n- \n\n## 非目标\n\n- \n\n---\n\n## 解决方案\n\n方案的高层次描述。\n",
            )},
            "default_views": [
                {"id": "spec", "type": "document", "title": L("Spec", "需求文档"), "icon": "📝",
                 "data": {"text": L(
                     "## Product Spec: [Feature Name]\n\n**Author:** \n**Status:** Draft | Review | Approved\n**Reviewers:** \n**Last Updated:** \n\n---\n\n## TL;DR\n\n[One paragraph summary of the feature and its impact]\n\n---\n\n## Problem Statement\n\nWhat problem does this solve? Who is affected, and how severely?\n\n---\n\n## Goals\n\n- \n\n## Non-Goals\n\n- \n\n---\n\n## Proposed Solution\n\n### Overview\n\n[High-level approach]\n\n### User Flow\n\n1. User opens…\n2. User sees…\n3. User can…\n\n### Edge Cases\n\n- \n\n---\n\n## Design & Technical Notes\n\n**Design:** [Link to Figma / mockups]\n**API changes:** \n**Dependencies:** \n\n---\n\n## Open Questions\n\n- [ ] \n- [ ] \n\n---\n\n## Launch Plan\n\n**Rollout:** Gradual (10% → 50% → 100%) | Full\n**Feature flag:** \n**Rollback plan:** \n",
                     "## 产品需求文档: [功能名称]\n\n**作者:** \n**状态:** 草稿 | 评审中 | 已批准\n**评审人:** \n**最后更新:** \n\n---\n\n## 摘要\n\n[一段话总结功能及其影响]\n\n---\n\n## 问题陈述\n\n我们要解决什么问题？影响哪些用户，影响有多严重？\n\n---\n\n## 目标\n\n- \n\n## 非目标\n\n- \n\n---\n\n## 解决方案\n\n### 概述\n\n[高层次设计思路]\n\n### 用户流程\n\n1. 用户打开…\n2. 用户看到…\n3. 用户可以…\n\n### 边界情况\n\n- \n\n---\n\n## 设计与技术说明\n\n**设计稿:** [Figma / 原型链接]\n**API 变更:** \n**依赖项:** \n\n---\n\n## 待解决问题\n\n- [ ] \n- [ ] \n\n---\n\n## 上线计划\n\n**发布策略:** 灰度发布 (10% → 50% → 100%) | 全量\n**功能开关:** \n**回滚方案:** \n",
                 )}},
                {"id": "user_stories", "type": "table", "title": L("User Stories", "用户故事"), "icon": "🌟",
                 "columns": [COL("as_a", "As a", "作为"), COL("i_want", "I want to", "我希望"),
                             COL("so_that", "So that", "以便"), COL("priority", "Priority", "优先级"),
                             COL("status", "Status", "状态")],
                 "rows": [
                     ROW(**{"as_a": L("new user", "新用户"), "i_want": L("", ""), "so_that": L("", ""), "priority": L("High", "高"), "status": L("Draft", "草稿")}),
                     ROW(**{"as_a": L("power user", "高级用户"), "i_want": L("", ""), "so_that": L("", ""), "priority": L("Medium", "中"), "status": L("Draft", "草稿")}),
                 ]},
                {"id": "impl_tasks", "type": "task_tracker", "title": L("Implementation", "实现任务"), "icon": "⚙️",
                 "data": {"_tasks": [
                     TASK("ps1", "Write product spec and get approval", "编写产品需求文档并获得批准", priority="high"),
                     TASK("ps2", "Create design mockups in Figma", "在Figma中创建设计稿", priority="high"),
                     TASK("ps3", "Design review and sign-off", "设计稿评审与通过", priority="medium"),
                     TASK("ps4", "Backend API implementation", "后端API实现", priority="high"),
                     TASK("ps5", "Frontend implementation", "前端实现", priority="high"),
                     TASK("ps6", "QA testing and bug fixes", "QA测试与缺陷修复", priority="medium"),
                 ]}},
            ],
        },

        # ── 6. 1:1 Meeting ─────────────────────────────────────────────────────
        {
            "id": "tpl-1on1",
            "title": L("1:1 Meeting", "1对1会议"),
            "icon": "👤",
            "category": cat["meeting"],
            "description": L(
                "Talking points & follow-ups",
                "议题、跟进项",
            ),
            "content": {"text": L(
                "## 1:1 — [Name] × [Manager]\n\n**Date:** \n**Next 1:1:** \n\n---\n\n## How are you doing?\n\n\n\n---\n\n## Updates\n\n- \n\n---\n\n## Blockers & Support Needed\n\n- \n",
                "## 1对1 — [员工] × [上级]\n\n**日期:** \n**下次1对1:** \n\n---\n\n## 最近状态如何？\n\n\n\n---\n\n## 近期进展\n\n- \n\n---\n\n## 需要支持的问题\n\n- \n",
            )},
            "default_views": [
                {"id": "notes", "type": "document", "title": L("Notes", "笔记"), "icon": "📝",
                 "data": {"text": L(
                     "## 1:1 — [Name] × [Manager]\n\n**Date:** \n**Next 1:1:** \n\n---\n\n## How are you doing?\n\nOverall morale, energy, and engagement check.\n\n---\n\n## Updates & Wins\n\nWhat have you accomplished since our last 1:1?\n\n- \n\n---\n\n## Blockers & Support Needed\n\nWhat is getting in your way? What do you need from me?\n\n- \n\n---\n\n## Career & Growth\n\nIs there anything on your mind about career development, growth, or feedback?\n\n---\n\n## Manager Notes\n\n*(Private notes for manager)*\n",
                     "## 1对1 — [员工] × [上级]\n\n**日期:** \n**下次1对1:** \n\n---\n\n## 最近状态如何？\n\n整体士气、精力与工作投入程度确认。\n\n---\n\n## 进展与成果\n\n上次1对1以来完成了什么？\n\n- \n\n---\n\n## 需要支持的问题\n\n是什么在阻碍你？你需要我提供什么帮助？\n\n- \n\n---\n\n## 职业发展\n\n在职业发展、成长机会或反馈方面有什么想说的吗？\n\n---\n\n## 主管备注\n\n*(主管私人记录)*\n",
                 )}},
                {"id": "topics", "type": "table", "title": L("Talking Points", "议题"), "icon": "💬",
                 "columns": [COL("topic", "Topic", "话题"), COL("raised_by", "Raised by", "提出者"),
                             COL("priority", "Priority", "优先级"), COL("notes", "Notes", "备注")],
                 "rows": [
                     ROW(topic=L("Current project status", "当前项目状态"), raised_by=L("Employee", "员工"), priority=L("High", "高"), notes=""),
                     ROW(topic=L("Blockers and support needed", "阻碍与需要的支持"), raised_by=L("Employee", "员工"), priority=L("High", "高"), notes=""),
                     ROW(topic=L("Career development", "职业发展"), raised_by=L("Manager", "主管"), priority=L("Medium", "中"), notes=""),
                 ]},
                {"id": "followups", "type": "task_tracker", "title": L("Follow-ups", "后续行动"), "icon": "✅",
                 "data": {"_tasks": [
                     TASK("on1", "Manager: Share relevant reading / resources", "主管：分享相关资料与资源", priority="medium"),
                     TASK("on2", "Employee: Complete action item from last 1:1", "员工：完成上次1对1的行动项", priority="high"),
                     TASK("on3", "Schedule next 1:1 and share agenda", "安排下次1对1并分享议程", priority="low"),
                 ]}},
            ],
        },

        # ── 7. Sprint Planning ─────────────────────────────────────────────────
        {
            "id": "tpl-sprint-planning",
            "title": L("Sprint Planning", "冲刺计划"),
            "icon": "📦",
            "category": cat["engineering"],
            "description": L(
                "Backlog, capacity & tasks",
                "待办、产能、任务",
            ),
            "content": {"text": L(
                "## Sprint [N] Planning\n\n**Sprint Duration:** [Start] → [End]\n**Team:** \n**Sprint Goal:** \n\n---\n\n## Definition of Done\n\n- [ ] Code reviewed\n- [ ] Tests written\n- [ ] Deployed to staging\n",
                "## Sprint [N] 计划\n\n**冲刺周期:** [开始] → [结束]\n**团队:** \n**冲刺目标:** \n\n---\n\n## 完成标准 (DoD)\n\n- [ ] 代码已审查\n- [ ] 测试已编写\n- [ ] 已部署至测试环境\n",
            )},
            "default_views": [
                {"id": "planning", "type": "document", "title": L("Planning", "计划"), "icon": "📝",
                 "data": {"text": L(
                     "## Sprint [N] Planning\n\n**Sprint Duration:** [Start] → [End]\n**Team:** \n**Velocity (last sprint):** [N] points\n\n---\n\n## Sprint Goal\n\n> [One sentence describing what we'll achieve this sprint and why it matters]\n\n---\n\n## Committed Stories\n\nSee Backlog tab for full task list.\n\n**Total story points committed:** [N]\n\n---\n\n## Definition of Done\n\n- [ ] Code reviewed by at least 1 engineer\n- [ ] Unit tests written and passing\n- [ ] Integration tests passing\n- [ ] Deployed to staging\n- [ ] Product sign-off\n- [ ] Docs updated if applicable\n\n---\n\n## Risks\n\n- \n\n## Dependencies\n\n- \n",
                     "## Sprint [N] 计划\n\n**冲刺周期:** [开始] → [结束]\n**团队:** \n**速率（上次冲刺）:** [N] 点\n\n---\n\n## 冲刺目标\n\n> [一句话描述本次冲刺要达成什么目标及其重要性]\n\n---\n\n## 承诺的故事\n\n完整任务列表见待办列表标签页。\n\n**总承诺故事点:** [N]\n\n---\n\n## 完成标准 (DoD)\n\n- [ ] 至少1名工程师代码评审\n- [ ] 单元测试已编写并通过\n- [ ] 集成测试通过\n- [ ] 已部署至测试环境\n- [ ] 产品确认\n- [ ] 如适用，文档已更新\n\n---\n\n## 风险\n\n- \n\n## 依赖项\n\n- \n",
                 )}},
                {"id": "backlog", "type": "task_tracker", "title": L("Backlog", "待办列表"), "icon": "📋",
                 "data": {"_tasks": [
                     TASK("sp1", "User authentication — login flow", "用户认证 — 登录流程", status="in_progress", priority="high"),
                     TASK("sp2", "Dashboard redesign — new layout", "仪表盘改版 — 新布局", status="todo", priority="high"),
                     TASK("sp3", "API rate limiting implementation", "API 限流实现", status="todo", priority="medium"),
                     TASK("sp4", "Fix pagination bug in data table", "修复数据表格分页 Bug", status="todo", priority="medium"),
                     TASK("sp5", "Performance optimization for search", "搜索性能优化", status="todo", priority="low"),
                 ]}},
                {"id": "capacity", "type": "table", "title": L("Capacity", "产能"), "icon": "👥",
                 "columns": [COL("engineer", "Engineer", "工程师"), COL("days", "Available Days", "可用天数"),
                             COL("points", "Capacity (pts)", "产能(点)"), COL("focus", "Focus Area", "重点领域")],
                 "rows": [
                     ROW(engineer=L("Engineer 1", "工程师1"), days="9", points="13", focus=L("Frontend", "前端")),
                     ROW(engineer=L("Engineer 2", "工程师2"), days="8", points="10", focus=L("Backend", "后端")),
                     ROW(engineer=L("Engineer 3", "工程师3"), days="10", points="13", focus=L("Full-stack", "全栈")),
                 ]},
            ],
        },

        # ── 8. Bug Report ──────────────────────────────────────────────────────
        {
            "id": "tpl-bug-report",
            "title": L("Bug Report", "缺陷报告"),
            "icon": "🐛",
            "category": cat["engineering"],
            "description": L(
                "Repro steps & fix tracking",
                "复现步骤、修复追踪",
            ),
            "content": {"text": L(
                "## Bug Report: [Short Description]\n\n**Severity:** Critical | High | Medium | Low\n**Status:** Open\n\n---\n\n## Steps to Reproduce\n\n1. \n2. \n3. \n\n---\n\n## Expected vs Actual\n\n**Expected:** \n**Actual:** \n",
                "## 缺陷报告: [简短描述]\n\n**严重程度:** 紧急 | 高 | 中 | 低\n**状态:** 待处理\n\n---\n\n## 复现步骤\n\n1. \n2. \n3. \n\n---\n\n## 预期 vs 实际\n\n**预期:** \n**实际:** \n",
            )},
            "default_views": [
                {"id": "report", "type": "document", "title": L("Report", "报告"), "icon": "📝",
                 "data": {"text": L(
                     "## Bug Report: [Short Description]\n\n**Reporter:** \n**Date:** \n**Severity:** Critical | High | Medium | Low\n**Status:** Open | In Progress | Fixed | Closed\n**Affected version:** \n**Environment:** Production | Staging | Dev\n\n---\n\n## Summary\n\n[One-paragraph description of the bug and its user impact]\n\n---\n\n## Expected Behavior\n\nWhat should happen?\n\n---\n\n## Actual Behavior\n\nWhat actually happens? Include screenshots or logs if possible.\n\n---\n\n## Root Cause\n\n*(Fill in after investigation)*\n\n---\n\n## Fix / Workaround\n\n**Workaround (if any):** \n**Proposed fix:** \n**PR link:** \n",
                     "## 缺陷报告: [简短描述]\n\n**提报人:** \n**日期:** \n**严重程度:** 紧急 | 高 | 中 | 低\n**状态:** 待处理 | 处理中 | 已修复 | 已关闭\n**受影响版本:** \n**环境:** 生产 | 预发布 | 开发\n\n---\n\n## 摘要\n\n[一段话描述缺陷及其对用户的影响]\n\n---\n\n## 预期行为\n\n应该发生什么？\n\n---\n\n## 实际行为\n\n实际发生了什么？如有可能请附上截图或日志。\n\n---\n\n## 根本原因\n\n*(排查后填写)*\n\n---\n\n## 修复方案\n\n**临时规避方案（如有）:** \n**修复方案:** \n**PR 链接:** \n",
                 )}},
                {"id": "repro", "type": "table", "title": L("Repro Steps", "复现步骤"), "icon": "🔁",
                 "columns": [COL("step", "Step", "步骤"), COL("action", "Action", "操作"),
                             COL("expected", "Expected", "预期"), COL("actual", "Actual", "实际")],
                 "rows": [
                     ROW(step="1", action=L("", ""), expected=L("", ""), actual=L("", "")),
                     ROW(step="2", action=L("", ""), expected=L("", ""), actual=L("", "")),
                     ROW(step="3", action=L("", ""), expected=L("", ""), actual=L("", "")),
                 ]},
                {"id": "fix_tasks", "type": "task_tracker", "title": L("Fix Tasks", "修复任务"), "icon": "🔧",
                 "data": {"_tasks": [
                     TASK("br1", "Investigate and identify root cause", "排查并确认根本原因", priority="high"),
                     TASK("br2", "Implement fix and write unit tests", "实现修复并编写单元测试", priority="high"),
                     TASK("br3", "Code review and QA verification", "代码评审与QA验证", priority="medium"),
                     TASK("br4", "Deploy fix to production and monitor", "部署修复至生产并监控", priority="medium"),
                 ]}},
            ],
        },

        # ── 9. Quarterly Report ────────────────────────────────────────────────
        {
            "id": "tpl-quarterly-report",
            "title": L("Quarterly Report", "季度报告"),
            "icon": "📊",
            "category": cat["business"],
            "description": L(
                "KPIs & quarterly goals",
                "KPI 与季度目标",
            ),
            "content": {"text": L(
                "## Q[N] [Year] Quarterly Report\n\n**Prepared by:** \n**Date:** \n\n---\n\n## Executive Summary\n\n[2-3 sentence summary of the quarter]\n\n---\n\n## Highlights\n\n### Wins\n- \n\n### Misses\n- \n",
                "## Q[N] [年份] 季度报告\n\n**编写人:** \n**日期:** \n\n---\n\n## 执行摘要\n\n[2-3句话总结本季度情况]\n\n---\n\n## 亮点\n\n### 成果\n- \n\n### 不足\n- \n",
            )},
            "default_views": [
                {"id": "report", "type": "document", "title": L("Report", "报告"), "icon": "📝",
                 "data": {"text": L(
                     "## Q[N] [Year] Quarterly Report\n\n**Prepared by:** \n**Date:** \n**Distribution:** Executive team, Board\n\n---\n\n## Executive Summary\n\n[2-3 sentences summarizing the quarter's performance, highlights, and key themes]\n\n---\n\n## Highlights\n\n### Wins 🏆\n- \n\n### Misses ⚠️\n- \n\n---\n\n## Business Performance\n\nSee KPIs tab for detailed metrics.\n\n**Revenue:** \n**Customer count:** \n**NPS:** \n\n---\n\n## Key Decisions Made This Quarter\n\n1. \n2. \n3. \n\n---\n\n## What We Learned\n\n- \n\n---\n\n## Q[N+1] Strategy & Priorities\n\n1. \n2. \n3. \n",
                     "## Q[N] [年份] 季度报告\n\n**编写人:** \n**日期:** \n**发送范围:** 管理团队、董事会\n\n---\n\n## 执行摘要\n\n[2-3句话总结本季度表现、亮点与关键主题]\n\n---\n\n## 亮点\n\n### 成果 🏆\n- \n\n### 不足 ⚠️\n- \n\n---\n\n## 业务表现\n\n详细指标见KPI标签页。\n\n**营收:** \n**客户数:** \n**NPS:** \n\n---\n\n## 本季度重大决策\n\n1. \n2. \n3. \n\n---\n\n## 经验教训\n\n- \n\n---\n\n## Q[N+1] 战略与优先级\n\n1. \n2. \n3. \n",
                 )}},
                {"id": "kpis", "type": "table", "title": L("KPIs", "关键指标"), "icon": "📊",
                 "columns": [COL("metric", "Metric", "指标"), COL("target", "Target", "目标"),
                             COL("actual", "Actual", "实际"), COL("vs_target", "vs Target", "达标"),
                             COL("vs_lq", "vs Last Q", "环比"), COL("notes", "Notes", "备注")],
                 "rows": [
                     ROW(metric=L("Revenue", "营收"), target="", actual="", vs_target="", vs_lq="", notes=""),
                     ROW(metric=L("New customers", "新客户数"), target="", actual="", vs_target="", vs_lq="", notes=""),
                     ROW(metric=L("Churn rate", "客户流失率"), target="", actual="", vs_target="", vs_lq="", notes=""),
                     ROW(metric=L("NPS", "净推荐值"), target="", actual="", vs_target="", vs_lq="", notes=""),
                 ]},
                {"id": "next_quarter", "type": "table", "title": L("Next Quarter", "下季度"), "icon": "🎯",
                 "columns": [COL("priority", "Priority", "优先事项"), COL("goal", "Goal", "目标"),
                             COL("owner", "Owner", "负责人"), COL("success_metric", "Success Metric", "成功指标")],
                 "rows": [
                     ROW(priority=L("1", "1"), goal="", owner="", success_metric=""),
                     ROW(priority=L("2", "2"), goal="", owner="", success_metric=""),
                     ROW(priority=L("3", "3"), goal="", owner="", success_metric=""),
                 ]},
            ],
        },

        # ── 10. Press Release ──────────────────────────────────────────────────
        {
            "id": "tpl-press-release",
            "title": L("Press Release", "新闻稿"),
            "icon": "📣",
            "category": cat["marketing"],
            "description": L(
                "Launch announcements",
                "产品发布公告",
            ),
            "content": {"text": L(
                "## [COMPANY] ANNOUNCES [NEWS]\n\n**FOR IMMEDIATE RELEASE**\n\n*[City, Date]* — [Company], today announced [announcement].\n",
                "## [公司名称] 发布 [新闻内容]\n\n**即时发布**\n\n*[城市，日期]* — [公司名称] 今日宣布 [发布内容]。\n",
            )},
            "default_views": [
                {"id": "release", "type": "document", "title": L("Release", "新闻稿"), "icon": "📝",
                 "data": {"text": L(
                     "## [COMPANY NAME] ANNOUNCES [NEWS]\n\n**FOR IMMEDIATE RELEASE**\n\n*[City, Date]* — [Company Name], a leader in [industry], today announced [what you're announcing], enabling [key benefit].\n\n---\n\n## Overview\n\n[2-3 paragraphs expanding on the announcement, including why it matters, who it's for, and what makes it different]\n\n---\n\n## Quote from Leadership\n\n\"[Inspiring, human quote from CEO or senior leader about the significance of this news.]\"\n\n— [Name], [Title], [Company]\n\n---\n\n## Quote from Customer / Partner *(optional)*\n\n\"[Quote from a customer or partner validating the value of this announcement.]\"\n\n— [Name], [Title], [Company]\n\n---\n\n## About [Company Name]\n\n[2-3 sentence boilerplate description of the company, mission, and key facts]\n\n---\n\n## Media Contact\n\n**Name:** \n**Email:** \n**Phone:** \n",
                     "## [公司名称] 发布 [新闻内容]\n\n**即时发布**\n\n*[城市，日期]* — [公司名称]，[行业]领域的领先企业，今日宣布 [发布内容]，为 [目标用户] 带来 [核心价值]。\n\n---\n\n## 概述\n\n[2-3段详细说明，包括为什么重要、受众是谁、与众不同之处]\n\n---\n\n## 领导层引语\n\n\"[CEO 或高级领导对本次新闻意义的深刻、真实引言。]\"\n\n— [姓名]，[职位]，[公司]\n\n---\n\n## 客户/合作伙伴引语 *(可选)*\n\n\"[来自客户或合作伙伴验证本次公告价值的引言。]\"\n\n— [姓名]，[职位]，[公司]\n\n---\n\n## 关于 [公司名称]\n\n[2-3句公司简介，说明使命与关键数据]\n\n---\n\n## 媒体联系\n\n**姓名:** \n**邮箱:** \n**电话:** \n",
                 )}},
                {"id": "quotes", "type": "table", "title": L("Quotes", "引语"), "icon": "🗣️",
                 "columns": [COL("quote", "Quote", "引语"), COL("name", "Name", "姓名"),
                             COL("title", "Title", "职位"), COL("company", "Company", "公司"), COL("approved", "Approved", "已审批")],
                 "rows": [
                     ROW(quote="", name=L("CEO Name", "CEO姓名"), title="CEO", company=L("Your Company", "本公司"), approved=L("Pending", "待审批")),
                     ROW(quote="", name=L("Customer Name", "客户姓名"), title=L("Title", "职位"), company=L("Customer Co", "客户公司"), approved=L("Pending", "待审批")),
                 ]},
                {"id": "distribution", "type": "table", "title": L("Distribution", "发布渠道"), "icon": "📣",
                 "columns": [COL("outlet", "Media Outlet", "媒体"), COL("contact", "Contact", "联系人"),
                             COL("send_date", "Send Date", "发送日期"), COL("status", "Status", "状态")],
                 "rows": [
                     ROW(outlet=L("TechCrunch", "TechCrunch"), contact="", send_date="", status=L("Planned", "计划中")),
                     ROW(outlet=L("PR Newswire", "PR Newswire"), contact="", send_date="", status=L("Planned", "计划中")),
                     ROW(outlet=L("Company Blog", "公司博客"), contact="", send_date="", status=L("Planned", "计划中")),
                 ]},
            ],
        },

        # ── 11. Team Wiki ──────────────────────────────────────────────────────
        {
            "id": "tpl-team-wiki",
            "title": L("Team Wiki", "团队知识库"),
            "icon": "📖",
            "category": cat["planning"],
            "description": L(
                "Team docs & directory",
                "团队文档、通讯录",
            ),
            "content": {"text": L(
                "## Team Wiki\n\n> Central knowledge base. Keep it up to date!\n\n## About Our Team\n\n**Team name:** \n**Mission:** \n",
                "## 团队知识库\n\n> 中央知识库，请保持更新！\n\n## 团队简介\n\n**团队名称:** \n**使命:** \n",
            )},
            "default_views": [
                {"id": "wiki", "type": "document", "title": L("Wiki", "知识库"), "icon": "📝",
                 "data": {"text": L(
                     "## Team Wiki\n\n> 📌 This is our team's central knowledge base. Please keep it up to date!\n\n---\n\n## 👋 About Our Team\n\n**Team name:** \n**Mission:** \n**Team lead:** \n**Org:** \n\n---\n\n## 📋 How We Work\n\n- **Standups:** Daily at [time] in [channel]\n- **Sprint length:** 2 weeks\n- **Sprint planning:** [day] at [time]\n- **Retrospective:** [day] at [time]\n- **Demo:** [day] at [time]\n\n---\n\n## 🔧 Tools & Systems\n\n- **Project management:** \n- **Design:** \n- **Code:** \n- **Communication:** \n- **Docs:** \n\n---\n\n## 📐 Team Norms & Culture\n\n- **Communication:** We default to async. Urgent? Ping on Slack.\n- **Meetings:** Agenda required. No agenda = cancelled.\n- **Decision making:** [Driver + Approver + Contributors + Informed]\n- **Feedback:** We give direct, kind feedback regularly.\n\n---\n\n## 🚨 On-call & Incidents\n\n**On-call rotation:** \n**Incident runbook:** \n**Escalation path:** \n",
                     "## 团队知识库\n\n> 📌 这是我们团队的中央知识库，请保持更新！\n\n---\n\n## 👋 团队简介\n\n**团队名称:** \n**使命:** \n**团队负责人:** \n**所属部门:** \n\n---\n\n## 📋 工作方式\n\n- **每日站会:** 每天[时间]在[频道]\n- **迭代周期:** 2周\n- **迭代计划会:** [星期]的[时间]\n- **回顾会:** [星期]的[时间]\n- **Demo演示:** [星期]的[时间]\n\n---\n\n## 🔧 工具与系统\n\n- **项目管理:** \n- **设计:** \n- **代码:** \n- **沟通:** \n- **文档:** \n\n---\n\n## 📐 团队规范与文化\n\n- **沟通:** 默认异步沟通。紧急？在Slack直接@。\n- **会议:** 必须有议程，无议程的会议将取消。\n- **决策:** [负责人 + 审批人 + 贡献者 + 知情人]\n- **反馈:** 我们定期给予直接、善意的反馈。\n\n---\n\n## 🚨 值班与事故处理\n\n**值班轮次:** \n**事故处理手册:** \n**升级路径:** \n",
                 )}},
                {"id": "resources", "type": "table", "title": L("Resources", "资源"), "icon": "🔗",
                 "columns": [COL("resource", "Resource", "资源"), COL("link", "Link", "链接"),
                             COL("owner", "Owner", "负责人"), COL("type", "Type", "类型"), COL("notes", "Notes", "备注")],
                 "rows": [
                     ROW(resource=L("Team Roadmap", "团队路线图"), link="", owner="", type=L("Planning", "规划"), notes=""),
                     ROW(resource=L("Design System", "设计系统"), link="", owner="", type=L("Design", "设计"), notes=""),
                     ROW(resource=L("API Documentation", "API文档"), link="", owner="", type=L("Engineering", "工程"), notes=""),
                 ]},
                {"id": "members", "type": "table", "title": L("Members", "成员"), "icon": "👥",
                 "columns": [COL("name", "Name", "姓名"), COL("role", "Role", "角色"),
                             COL("focus", "Focus", "专注领域"), COL("slack", "Slack / Contact", "联系方式"), COL("timezone", "Timezone", "时区")],
                 "rows": [
                     ROW(name="", role=L("Engineering Lead", "工程负责人"), focus=L("Architecture", "架构"), slack="", timezone="UTC+8"),
                     ROW(name="", role=L("Product Manager", "产品经理"), focus=L("Roadmap", "路线图"), slack="", timezone="UTC+8"),
                     ROW(name="", role=L("Designer", "设计师"), focus=L("UX", "用户体验"), slack="", timezone="UTC+8"),
                 ]},
            ],
        },

        # ── 12. Product Roadmap ────────────────────────────────────────────────
        {
            "id": "tpl-roadmap",
            "title": L("Product Roadmap", "产品路线图"),
            "icon": "🗺️",
            "category": cat["product"],
            "description": L(
                "Feature pipeline & milestones",
                "功能管道、里程碑",
            ),
            "content": {"text": L(
                "## Product Roadmap [Year]\n\n**Last updated:** \n**Owner:** \n\n---\n\n## Vision\n\n[One sentence describing the product vision]\n\n---\n\n## Status Legend\n\n⬜ Planned | 🟡 In Progress | ✅ Done | 🔵 Research | 🔴 Blocked\n",
                "## 产品路线图 [年份]\n\n**最后更新:** \n**负责人:** \n\n---\n\n## 愿景\n\n[一句话描述产品愿景]\n\n---\n\n## 状态说明\n\n⬜ 计划中 | 🟡 进行中 | ✅ 已完成 | 🔵 研究中 | 🔴 阻塞\n",
            )},
            "default_views": [
                {"id": "roadmap", "type": "document", "title": L("Roadmap", "路线图"), "icon": "📝",
                 "data": {"text": L(
                     "## Product Roadmap [Year]\n\n**Last updated:** \n**Owner:** \n**Horizon:** Annual\n\n---\n\n## Product Vision\n\n> [One sentence describing where the product is headed this year and why it matters]\n\n---\n\n## Principles\n\nWhen making roadmap decisions, we prioritize:\n1. Customer value over internal convenience\n2. Depth over breadth\n3. Quality over speed\n\n---\n\n## Status Legend\n\n⬜ Planned | 🟡 In Progress | ✅ Done | 🔵 Research | 🔴 Blocked | ⏸ On Hold\n\n---\n\n## Q1 — Theme: [Focus Area]\n\n| Feature | Status | Impact | Effort | Owner |\n|---------|--------|--------|--------|-------|\n|         | ⬜     |        |        |       |\n\n---\n\n## Q2 — Theme: [Focus Area]\n\n| Feature | Status | Impact | Effort | Owner |\n|---------|--------|--------|--------|-------|\n|         | ⬜     |        |        |       |\n\n---\n\n## Q3 / Q4 — Later\n\n*(Tentative — subject to change based on learnings)*\n\n- \n",
                     "## 产品路线图 [年份]\n\n**最后更新:** \n**负责人:** \n**时间跨度:** 年度\n\n---\n\n## 产品愿景\n\n> [一句话描述今年产品的发展方向及其重要性]\n\n---\n\n## 决策原则\n\n制定路线图决策时，我们优先考虑：\n1. 用户价值高于内部便利\n2. 深度高于广度\n3. 质量高于速度\n\n---\n\n## 状态说明\n\n⬜ 计划中 | 🟡 进行中 | ✅ 已完成 | 🔵 研究中 | 🔴 阻塞 | ⏸ 暂停\n\n---\n\n## Q1 — 主题: [重点领域]\n\n| 功能 | 状态 | 影响 | 工作量 | 负责人 |\n|------|------|------|--------|--------|\n|      | ⬜   |      |        |        |\n\n---\n\n## Q2 — 主题: [重点领域]\n\n| 功能 | 状态 | 影响 | 工作量 | 负责人 |\n|------|------|------|--------|--------|\n|      | ⬜   |      |        |        |\n\n---\n\n## Q3/Q4 — 未来计划\n\n*(暂定 — 将根据实际情况调整)*\n\n- \n",
                 )}},
                {"id": "features", "type": "table", "title": L("Features", "功能列表"), "icon": "🚀",
                 "columns": [COL("feature", "Feature", "功能"), COL("quarter", "Quarter", "季度"),
                             COL("theme", "Theme", "主题"), COL("status", "Status", "状态"),
                             COL("impact", "Impact", "影响"), COL("effort", "Effort", "工作量"), COL("owner", "Owner", "负责人")],
                 "rows": [
                     ROW(feature=L("Feature 1", "功能1"), quarter="Q1", theme="", status=L("Planned", "计划中"), impact=L("High", "高"), effort="M", owner=""),
                     ROW(feature=L("Feature 2", "功能2"), quarter="Q1", theme="", status=L("In Progress", "进行中"), impact=L("High", "高"), effort="L", owner=""),
                     ROW(feature=L("Feature 3", "功能3"), quarter="Q2", theme="", status=L("Planned", "计划中"), impact=L("Medium", "中"), effort="S", owner=""),
                 ]},
                {"id": "milestones", "type": "task_tracker", "title": L("Milestones", "里程碑"), "icon": "🎯",
                 "data": {"_tasks": [
                     TASK("rm1", "Q1 feature complete and shipped", "Q1 功能完成并发布", priority="high"),
                     TASK("rm2", "Q1 retrospective and Q2 planning", "Q1 回顾与Q2计划", priority="medium"),
                     TASK("rm3", "Q2 feature complete and shipped", "Q2 功能完成并发布", priority="high"),
                     TASK("rm4", "Annual roadmap review with leadership", "与领导层进行年度路线图回顾", priority="medium"),
                 ]}},
            ],
        },

        # ── 13. Sprint Retrospective ───────────────────────────────────────────
        {
            "id": "tpl-retrospective",
            "title": L("Sprint Retrospective", "冲刺回顾"),
            "icon": "🔄",
            "category": cat["engineering"],
            "description": L(
                "Start / Stop / Continue",
                "开始/停止/继续",
            ),
            "content": {"text": L(
                "## Sprint [N] Retrospective\n\n**Date:** \n**Facilitator:** \n\n---\n\n## 🟢 Start | 🔴 Stop | 🟡 Continue\n\n",
                "## Sprint [N] 回顾\n\n**日期:** \n**主持人:** \n\n---\n\n## 🟢 开始做 | 🔴 停止做 | 🟡 继续做\n\n",
            )},
            "default_views": [
                {"id": "notes", "type": "document", "title": L("Notes", "笔记"), "icon": "📝",
                 "data": {"text": L(
                     "## Sprint [N] Retrospective\n\n**Date:** \n**Facilitator:** \n**Team:** \n**Sprint velocity:** [N] / [target] points\n\n---\n\n## How did the sprint go? (1–10)\n\n**Team rating:** /10\n\n---\n\n## 🟢 Start — What should we start doing?\n\n- \n- \n\n---\n\n## 🔴 Stop — What should we stop doing?\n\n- \n- \n\n---\n\n## 🟡 Continue — What's working well and should continue?\n\n- \n- \n\n---\n\n## 🎉 Team Shoutouts\n\nRecognize great work from this sprint:\n\n- \n",
                     "## Sprint [N] 回顾\n\n**日期:** \n**主持人:** \n**团队:** \n**本次冲刺速率:** [N] / [目标] 点\n\n---\n\n## 这次冲刺整体评分？(1–10)\n\n**团队评分:** /10\n\n---\n\n## 🟢 开始做 — 应该开始做什么？\n\n- \n- \n\n---\n\n## 🔴 停止做 — 应该停止做什么？\n\n- \n- \n\n---\n\n## 🟡 继续做 — 哪些做得好应该继续？\n\n- \n- \n\n---\n\n## 🎉 团队表扬\n\n表彰本次冲刺中的优秀工作：\n\n- \n",
                 )}},
                {"id": "actions", "type": "task_tracker", "title": L("Action Items", "行动项"), "icon": "✅",
                 "data": {"_tasks": [
                     TASK("rt1", "Update team working agreement with retro insights", "根据回顾结论更新团队工作约定", priority="high"),
                     TASK("rt2", "Improve PR review process — set SLA", "改进PR评审流程 — 制定SLA", priority="medium"),
                     TASK("rt3", "Add automated test coverage for critical paths", "为关键路径添加自动化测试覆盖", priority="medium"),
                     TASK("rt4", "Review and reduce meeting load", "回顾并减少会议负担", priority="low"),
                 ]}},
                {"id": "metrics", "type": "table", "title": L("Metrics", "迭代数据"), "icon": "📊",
                 "columns": [COL("metric", "Metric", "指标"), COL("target", "Target", "目标"),
                             COL("actual", "Actual", "实际"), COL("trend", "Trend", "趋势"), COL("notes", "Notes", "备注")],
                 "rows": [
                     ROW(metric=L("Story points completed", "完成故事点"), target="", actual="", trend="", notes=""),
                     ROW(metric=L("Bugs introduced", "引入缺陷数"), target="0", actual="", trend="", notes=""),
                     ROW(metric=L("PR review time (avg)", "PR评审时长(均值)"), target="< 24h", actual="", trend="", notes=""),
                     ROW(metric=L("Deploy frequency", "部署频率"), target="", actual="", trend="", notes=""),
                 ]},
            ],
        },

        # ── 14. Research Notes ─────────────────────────────────────────────────
        {
            "id": "tpl-research-notes",
            "title": L("Research Notes", "研究笔记"),
            "icon": "🔬",
            "category": cat["personal"],
            "description": L(
                "Findings & source tracking",
                "发现、来源追踪",
            ),
            "content": {"text": L(
                "## Research: [Topic]\n\n**Researcher:** \n**Date:** \n**Research type:** Interviews | Survey | Usability Test | Desk Research\n\n---\n\n## Research Questions\n\n1. \n2. \n3. \n",
                "## 研究: [主题]\n\n**研究员:** \n**日期:** \n**研究类型:** 访谈 | 问卷 | 可用性测试 | 桌面研究\n\n---\n\n## 研究问题\n\n1. \n2. \n3. \n",
            )},
            "default_views": [
                {"id": "notes", "type": "document", "title": L("Notes", "笔记"), "icon": "📝",
                 "data": {"text": L(
                     "## Research: [Topic]\n\n**Researcher:** \n**Date:** \n**Research type:** Interviews | Survey | Usability Test | Desk Research\n**Status:** Planning | In Progress | Analysis | Complete\n\n---\n\n## Research Questions\n\n1. \n2. \n3. \n\n---\n\n## Methodology\n\n**Participants:** [N] total\n**Recruiting criteria:** \n**Method:** \n**Duration per session:** \n**Incentive:** \n\n---\n\n## Key Themes\n\n### Theme 1: [Name]\n\nEvidence:\n- \n\n### Theme 2: [Name]\n\nEvidence:\n- \n\n---\n\n## Recommendations\n\n1. \n2. \n3. \n\n---\n\n## Open Questions\n\n- \n",
                     "## 研究: [主题]\n\n**研究员:** \n**日期:** \n**研究类型:** 访谈 | 问卷 | 可用性测试 | 桌面研究\n**状态:** 规划中 | 进行中 | 分析中 | 已完成\n\n---\n\n## 研究问题\n\n1. \n2. \n3. \n\n---\n\n## 研究方法\n\n**参与者数量:** [N] 人\n**招募标准:** \n**研究方法:** \n**每次访谈时长:** \n**激励方式:** \n\n---\n\n## 关键主题\n\n### 主题1: [名称]\n\n证据：\n- \n\n### 主题2: [名称]\n\n证据：\n- \n\n---\n\n## 建议\n\n1. \n2. \n3. \n\n---\n\n## 待解决问题\n\n- \n",
                 )}},
                {"id": "findings", "type": "table", "title": L("Findings", "关键发现"), "icon": "💡",
                 "columns": [COL("finding", "Finding", "发现"), COL("theme", "Theme", "主题"),
                             COL("evidence", "Evidence", "证据"), COL("frequency", "Frequency", "频次"),
                             COL("impact", "Impact", "影响"), COL("recommendation", "Recommendation", "建议")],
                 "rows": [
                     ROW(finding=L("Finding 1", "发现1"), theme="", evidence="", frequency=L("High (8/10)", "高(8/10)"), impact=L("High", "高"), recommendation=""),
                     ROW(finding=L("Finding 2", "发现2"), theme="", evidence="", frequency=L("Medium (5/10)", "中(5/10)"), impact=L("Medium", "中"), recommendation=""),
                 ]},
                {"id": "sources", "type": "table", "title": L("Sources", "来源"), "icon": "📚",
                 "columns": [COL("source", "Source / Participant", "来源/参与者"), COL("type", "Type", "类型"),
                             COL("date", "Date", "日期"), COL("key_quote", "Key Quote", "关键引语"), COL("notes", "Notes", "备注")],
                 "rows": [
                     ROW(source=L("Participant 1", "参与者1"), type=L("Interview", "访谈"), date="", key_quote="", notes=""),
                     ROW(source=L("Participant 2", "参与者2"), type=L("Interview", "访谈"), date="", key_quote="", notes=""),
                 ]},
            ],
        },

        # ── 15. Interview Guide ────────────────────────────────────────────────
        {
            "id": "tpl-interview",
            "title": L("Interview Guide", "面试指南"),
            "icon": "🎤",
            "category": cat["meeting"],
            "description": L(
                "Questions & scoring",
                "题库、评分",
            ),
            "content": {"text": L(
                "## Interview Guide — [Role]\n\n**Candidate:** \n**Interviewer:** \n**Date:** \n**Round:** Phone Screen | Technical | Culture | Final\n\n---\n\n## Questions\n\n**Q1:** \n*Notes:* \n\n**Overall:** /5\n",
                "## 面试指南 — [职位]\n\n**候选人:** \n**面试官:** \n**日期:** \n**轮次:** 电话筛选 | 技术面 | 文化面 | 终面\n\n---\n\n## 面试问题\n\n**Q1:** \n*备注:* \n\n**总分:** /5\n",
            )},
            "default_views": [
                {"id": "guide", "type": "document", "title": L("Guide", "指南"), "icon": "📝",
                 "data": {"text": L(
                     "## Interview Guide — [Role]\n\n**Candidate:** \n**Interviewer:** \n**Date:** \n**Round:** Phone Screen | Technical | Culture | Final\n**Duration:** 45 minutes\n\n---\n\n## Candidate Background\n\n- **Current role / company:** \n- **Years of experience:** \n- **Key skills noted from resume:** \n\n---\n\n## Opening (5 min)\n\n- Introduce yourself and the team\n- Explain the interview format and duration\n- \"Tell me about yourself and why you're interested in this role?\"\n\n---\n\n## Structured Questions (30 min)\n\nSee Questions tab for the full question bank.\n\n---\n\n## Candidate Questions (5 min)\n\nAllow time for the candidate to ask questions.\n\n---\n\n## Overall Assessment\n\n**Strengths:** \n**Concerns:** \n**Overall score:** /5\n**Recommendation:** ✅ Advance | ❌ Pass | 🤔 Unsure\n**Debrief notes:** \n",
                     "## 面试指南 — [职位]\n\n**候选人:** \n**面试官:** \n**日期:** \n**轮次:** 电话筛选 | 技术面 | 文化面 | 终面\n**时长:** 45分钟\n\n---\n\n## 候选人背景\n\n- **当前职位/公司:** \n- **工作年限:** \n- **简历中的主要技能:** \n\n---\n\n## 开场 (5分钟)\n\n- 自我介绍和团队介绍\n- 说明面试形式与时长\n- \"请介绍一下你自己，以及为什么对这个职位感兴趣？\"\n\n---\n\n## 结构化问题 (30分钟)\n\n完整题库见问题标签页。\n\n---\n\n## 候选人提问 (5分钟)\n\n预留时间让候选人提问。\n\n---\n\n## 综合评估\n\n**优势:** \n**顾虑:** \n**总分:** /5\n**建议:** ✅ 晋级 | ❌ 淘汰 | 🤔 待定\n**汇报备注:** \n",
                 )}},
                {"id": "questions", "type": "table", "title": L("Questions", "题库"), "icon": "❓",
                 "columns": [COL("question", "Question", "问题"), COL("area", "Area", "考察方向"),
                             COL("type", "Type", "类型"), COL("what_to_look_for", "What to look for", "评估要点")],
                 "rows": [
                     ROW(question=L("Tell me about a challenging project you led", "讲一个你主导的有挑战性的项目"), area=L("Leadership", "领导力"), type=L("Behavioral", "行为"), what_to_look_for=L("Ownership, problem-solving", "主人翁意识、解决问题")),
                     ROW(question=L("How do you handle competing priorities?", "你如何处理优先级冲突？"), area=L("Execution", "执行力"), type=L("Behavioral", "行为"), what_to_look_for=L("Prioritization framework", "优先级框架")),
                     ROW(question=L("Describe your ideal working environment", "描述你理想的工作环境"), area=L("Culture fit", "文化契合"), type=L("Open-ended", "开放式"), what_to_look_for=L("Alignment with team culture", "与团队文化契合")),
                     ROW(question=L("Where do you see yourself in 2–3 years?", "2-3年内你希望达到什么状态？"), area=L("Growth", "成长"), type=L("Open-ended", "开放式"), what_to_look_for=L("Ambition, self-awareness", "进取心、自我认知")),
                 ]},
                {"id": "evaluation", "type": "table", "title": L("Evaluation", "评估"), "icon": "📊",
                 "columns": [COL("area", "Area", "评估维度"), COL("weight", "Weight", "权重"),
                             COL("score", "Score (1–5)", "评分(1-5)"), COL("notes", "Notes", "备注")],
                 "rows": [
                     ROW(area=L("Technical skills", "技术能力"), weight="30%", score="", notes=""),
                     ROW(area=L("Problem solving", "解决问题"), weight="25%", score="", notes=""),
                     ROW(area=L("Communication", "沟通能力"), weight="20%", score="", notes=""),
                     ROW(area=L("Culture fit", "文化契合"), weight="15%", score="", notes=""),
                     ROW(area=L("Growth potential", "成长潜力"), weight="10%", score="", notes=""),
                 ]},
            ],
        },

        # ── 16. Employee Onboarding ────────────────────────────────────────────
        {
            "id": "tpl-onboarding",
            "title": L("Employee Onboarding", "员工入职"),
            "icon": "🎉",
            "category": cat["business"],
            "description": L(
                "Onboarding checklist",
                "入职清单",
            ),
            "content": {"text": L(
                "## Onboarding — [Employee Name]\n\n**Role:** \n**Start date:** \n**Manager:** \n**Buddy:** \n",
                "## 入职手册 — [员工姓名]\n\n**职位:** \n**入职日期:** \n**直属上级:** \n**入职伙伴:** \n",
            )},
            "default_views": [
                {"id": "guide", "type": "document", "title": L("Guide", "指南"), "icon": "📝",
                 "data": {"text": L(
                     "## Onboarding — [Employee Name]\n\n**Role:** \n**Start date:** \n**Manager:** \n**Buddy (peer who helps them settle in):** \n**Team:** \n\n---\n\n## Welcome 👋\n\nWe're so excited to have you join the team! This guide will help you get set up and feel confident in your first 30 days.\n\n---\n\n## Pre-Day 1 (Manager)\n\n- [ ] Send welcome email with first day logistics\n- [ ] Set up laptop, accounts (email, Slack, GitHub, etc.)\n- [ ] Add to relevant Slack channels and meetings\n- [ ] Schedule Day 1 agenda\n- [ ] Assign onboarding buddy\n\n---\n\n## Week 1 — Get Set Up\n\n**Goal:** Meet the team, get tools working, understand the big picture.\n\n- [ ] Complete all account setups\n- [ ] Meet your direct team (1:1s with each person)\n- [ ] Read company handbook and culture docs\n- [ ] Complete compliance / security training\n- [ ] Set up local dev environment (if applicable)\n\n---\n\n## Week 2 — Learn the Work\n\n**Goal:** Understand how the team works and contribute to something.\n\n- [ ] Shadow key workflows and processes\n- [ ] Attend first standup, sprint planning\n- [ ] Complete first small task or PR\n- [ ] 1:1 check-in with manager\n\n---\n\n## Week 4 — Take Ownership\n\n**Goal:** Work more independently and begin owning a project area.\n\n- [ ] Lead a meeting or present to the team\n- [ ] Identify areas where you can add value\n- [ ] 30-day check-in with manager — share feedback both ways\n",
                     "## 入职手册 — [员工姓名]\n\n**职位:** \n**入职日期:** \n**直属上级:** \n**入职伙伴（帮助新人适应的同事）:** \n**所属团队:** \n\n---\n\n## 欢迎 👋\n\n非常高兴你加入团队！本手册将帮助你在入职的前30天顺利融入，建立信心。\n\n---\n\n## 入职前（主管负责）\n\n- [ ] 发送欢迎邮件，告知第一天的安排\n- [ ] 配置笔记本电脑和账号（邮件、Slack、GitHub等）\n- [ ] 加入相关Slack频道与会议\n- [ ] 安排第一天日程\n- [ ] 指定入职伙伴\n\n---\n\n## 第一周 — 安顿下来\n\n**目标：** 认识团队、配置好工具、了解整体情况。\n\n- [ ] 完成所有账号配置\n- [ ] 与直属团队成员分别进行1对1\n- [ ] 阅读公司手册与文化文档\n- [ ] 完成合规/安全培训\n- [ ] 配置本地开发环境（如适用）\n\n---\n\n## 第二周 — 了解工作\n\n**目标：** 理解团队工作方式，开始参与贡献。\n\n- [ ] 了解关键工作流程\n- [ ] 参加第一次站会、冲刺计划会\n- [ ] 完成第一个小任务或PR\n- [ ] 与主管进行1对1反馈\n\n---\n\n## 第四周 — 独立承担\n\n**目标：** 更独立地工作，开始负责某个项目领域。\n\n- [ ] 主持一次会议或向团队展示\n- [ ] 识别自己能贡献价值的领域\n- [ ] 与主管进行30天反馈——双向分享意见\n",
                 )}},
                {"id": "checklist", "type": "task_tracker", "title": L("Checklist", "任务清单"), "icon": "✅",
                 "data": {"_tasks": [
                     TASK("ob1", "Set up all accounts (email, Slack, tools)", "配置所有账号（邮件、Slack、工具）", status="todo", priority="high"),
                     TASK("ob2", "Meet with manager — discuss role and 30-day goals", "与主管会面 — 讨论职责与30天目标", status="todo", priority="high"),
                     TASK("ob3", "1:1 introductions with each team member", "与每位团队成员进行1对1介绍", status="todo", priority="high"),
                     TASK("ob4", "Read company handbook and culture docs", "阅读公司手册与文化文档", status="todo", priority="medium"),
                     TASK("ob5", "Complete compliance and security training", "完成合规与安全培训", status="todo", priority="high"),
                     TASK("ob6", "Complete first real task or contribution", "完成第一个真实任务或贡献", status="todo", priority="medium"),
                     TASK("ob7", "30-day check-in with manager", "与主管进行30天反馈会谈", status="todo", priority="medium"),
                 ]}},
                {"id": "resources", "type": "table", "title": L("Resources", "资源"), "icon": "📚",
                 "columns": [COL("resource", "Resource", "资源"), COL("link", "Link", "链接"),
                             COL("must_read", "Must Read", "必读"), COL("notes", "Notes", "备注")],
                 "rows": [
                     ROW(resource=L("Company Handbook", "公司手册"), link="", must_read=L("Yes", "是"), notes=""),
                     ROW(resource=L("Engineering Onboarding Guide", "工程入职指南"), link="", must_read=L("Yes", "是"), notes=""),
                     ROW(resource=L("Team Wiki", "团队知识库"), link="", must_read=L("Yes", "是"), notes=""),
                     ROW(resource=L("Code Contribution Guide", "代码贡献指南"), link="", must_read=L("Yes", "是"), notes=""),
                 ]},
            ],
        },

        # ── 17. Content Calendar ───────────────────────────────────────────────
        {
            "id": "tpl-content-calendar",
            "title": L("Content Calendar", "内容日历"),
            "icon": "📅",
            "category": cat["marketing"],
            "description": L(
                "Content scheduling",
                "内容排期",
            ),
            "content": {"text": L(
                "## Content Calendar — [Month/Quarter]\n\n**Owner:** \n**Channels:** Blog | LinkedIn | Newsletter | Video\n\n---\n\n## Monthly Theme\n\n[Main topic or campaign theme]\n\n---\n\n## Status: 🔴 Not started | 📝 Draft | 👁️ Review | ✅ Scheduled | 🟢 Published\n",
                "## 内容日历 — [月份/季度]\n\n**负责人:** \n**渠道:** 博客 | LinkedIn | 邮件通讯 | 视频\n\n---\n\n## 月度主题\n\n[本周期的核心话题或营销主题]\n\n---\n\n## 状态: 🔴 未开始 | 📝 草稿 | 👁️ 审核中 | ✅ 已排期 | 🟢 已发布\n",
            )},
            "default_views": [
                {"id": "strategy", "type": "document", "title": L("Strategy", "策略"), "icon": "📝",
                 "data": {"text": L(
                     "## Content Calendar — [Month / Quarter]\n\n**Owner:** \n**Channels:** Blog | LinkedIn | Twitter/X | Newsletter | Video | Podcast\n**Publishing cadence:** [N] pieces/week\n\n---\n\n## Monthly Theme\n\n> [Main topic or campaign theme — the 'red thread' tying all content together]\n\n---\n\n## Audience & Goals\n\n**Primary audience:** \n**Content goal:** Awareness | Consideration | Conversion | Retention\n**Key message:** \n\n---\n\n## Tone & Style Guide\n\n- Voice: [Authoritative | Conversational | Educational | Entertaining]\n- Format guidelines:\n  - Blog posts: 1,000–2,000 words\n  - LinkedIn: 150–300 words\n  - Newsletter: 500–800 words\n\n---\n\n## Status Legend\n\n🔴 Not started | 📝 Draft | 👁️ In review | ✅ Scheduled | 🟢 Published | ⏸ On hold\n\n---\n\n## Key Dates / Events\n\n| Date | Event | Opportunity |\n|------|-------|------------|\n|      |       |            |\n",
                     "## 内容日历 — [月份/季度]\n\n**负责人:** \n**渠道:** 博客 | LinkedIn | Twitter/X | 邮件通讯 | 视频 | 播客\n**发布节奏:** 每周[N]篇\n\n---\n\n## 月度主题\n\n> [核心话题或营销主题 — 将所有内容串联的主线]\n\n---\n\n## 受众与目标\n\n**主要受众:** \n**内容目标:** 品牌认知 | 购买考虑 | 转化促成 | 用户留存\n**核心信息:** \n\n---\n\n## 语气与风格指南\n\n- 声音: [权威 | 对话 | 教育 | 娱乐]\n- 格式规范:\n  - 博客: 1000-2000字\n  - LinkedIn: 150-300字\n  - 邮件通讯: 500-800字\n\n---\n\n## 状态说明\n\n🔴 未开始 | 📝 草稿 | 👁️ 审核中 | ✅ 已排期 | 🟢 已发布 | ⏸ 暂停\n\n---\n\n## 重要日期/事件\n\n| 日期 | 事件 | 内容机会 |\n|------|------|---------|\n|      |      |         |\n",
                 )}},
                {"id": "calendar", "type": "table", "title": L("Calendar", "排期表"), "icon": "📅",
                 "columns": [COL("pub_date", "Publish Date", "发布日期"), COL("title", "Title", "标题"),
                             COL("format", "Format", "格式"), COL("channel", "Channel", "渠道"),
                             COL("status", "Status", "状态"), COL("owner", "Owner", "负责人"), COL("link", "Link", "链接")],
                 "rows": [
                     ROW(pub_date="", title=L("Article 1", "文章1"), format=L("Blog post", "博客"), channel=L("Blog", "博客"), status=L("Draft", "草稿"), owner="", link=""),
                     ROW(pub_date="", title=L("LinkedIn post", "LinkedIn推文"), format=L("Social post", "社交推文"), channel="LinkedIn", status=L("Not started", "未开始"), owner="", link=""),
                     ROW(pub_date="", title=L("Newsletter #[N]", "邮件通讯#[N]"), format=L("Newsletter", "邮件通讯"), channel=L("Email", "邮件"), status=L("Not started", "未开始"), owner="", link=""),
                 ]},
                {"id": "content_tasks", "type": "task_tracker", "title": L("Tasks", "任务"), "icon": "✅",
                 "data": {"_tasks": [
                     TASK("cc1", "Write and publish blog post #1", "撰写并发布博客文章1", priority="high"),
                     TASK("cc2", "Design social media graphics for the month", "设计本月社交媒体配图", priority="medium"),
                     TASK("cc3", "Draft and schedule newsletter", "草拟并安排邮件通讯", priority="high"),
                     TASK("cc4", "Analyze last month's content performance", "分析上月内容表现", priority="medium"),
                 ]}},
            ],
        },

        # ── 18. Task Tracker (special) ─────────────────────────────────────────
        {
            "id": "tpl-task-tracker",
            "title": L("Task Tracker", "任务追踪器"),
            "icon": "✅",
            "category": cat["planning"],
            "description": L(
                "Multi-view task manager",
                "多视图任务管理",
            ),
            "content": {"_type": "task_tracker", "_tasks": []},
            "default_views": [],
        },

        # ── 19. Voice Notes (语音速记) ─────────────────────────────────────────
        {
            "id": "tpl-voice-notes",
            "title": L("Voice Notes", "语音速记"),
            "icon": "🎙️",
            "category": cat["personal"],
            "description": L(
                "Voice recording with real-time transcription",
                "语音录入，实时转文字",
            ),
            "content": {
                "_type": "voice_memo",
                "transcript": "",
                "notes": L(
                    "Context:\n- Topic:\n- Participants:\n- Goal:\n\nNotes while recording:\n- \n",
                    "背景：\n- 主题：\n- 参与人：\n- 目标：\n\n录音过程笔记：\n- \n",
                ),
                "summary_template": "general",
            },
            "default_views": [],
        },

        {
            "id": "tpl-voice-meeting",
            "title": L("Meeting Voice Memo", "会议语音纪要"),
            "icon": "🧾",
            "category": cat["meeting"],
            "description": L(
                "Capture meeting audio and auto-generate decisions/tasks",
                "录音并自动生成决议/待办",
            ),
            "content": {
                "_type": "voice_memo",
                "transcript": "",
                "notes": L(
                    "Meeting info:\n- Date:\n- Team:\n- Agenda:\n\nMust-capture items:\n- Decisions:\n- Risks:\n- Owners:\n",
                    "会议信息：\n- 日期：\n- 团队：\n- 议程：\n\n重点记录：\n- 决议：\n- 风险：\n- 责任人：\n",
                ),
                "summary_template": "meeting",
            },
            "default_views": [],
        },

        {
            "id": "tpl-voice-sales-call",
            "title": L("Sales Call Voice Memo", "销售通话语音纪要"),
            "icon": "📞",
            "category": cat["business"],
            "description": L(
                "Record sales calls and extract objections/follow-ups",
                "记录销售通话并提取异议/跟进项",
            ),
            "content": {
                "_type": "voice_memo",
                "transcript": "",
                "notes": L(
                    "Lead info:\n- Company:\n- Contact:\n- Stage:\n\nCapture:\n- Pain points:\n- Budget signal:\n- Timeline signal:\n- Next step:\n",
                    "线索信息：\n- 公司：\n- 联系人：\n- 阶段：\n\n重点记录：\n- 痛点：\n- 预算信号：\n- 时间信号：\n- 下一步：\n",
                ),
                "summary_template": "sales",
            },
            "default_views": [],
        },

        {
            "id": "tpl-voice-interview",
            "title": L("Interview Voice Memo", "面试语音纪要"),
            "icon": "🎧",
            "category": cat["hr"],
            "description": L(
                "Capture interview notes and auto-structure strengths/risks",
                "录音并自动结构化候选人优劣势",
            ),
            "content": {
                "_type": "voice_memo",
                "transcript": "",
                "notes": L(
                    "Candidate info:\n- Name:\n- Role:\n- Interviewers:\n\nCapture:\n- Strengths:\n- Risks:\n- Signals:\n- Recommendation:\n",
                    "候选人信息：\n- 姓名：\n- 岗位：\n- 面试官：\n\n重点记录：\n- 优势：\n- 风险：\n- 关键信号：\n- 建议：\n",
                ),
                "summary_template": "interview",
            },
            "default_views": [],
        },

        {
            "id": "tpl-voice-brainstorm",
            "title": L("Brainstorm Voice Memo", "头脑风暴语音纪要"),
            "icon": "💡",
            "category": cat["planning"],
            "description": L(
                "Capture idea sessions and cluster into executable experiments",
                "记录头脑风暴并聚类为可执行实验",
            ),
            "content": {
                "_type": "voice_memo",
                "transcript": "",
                "notes": L(
                    "Session context:\n- Topic:\n- Goal:\n\nIdeas:\n- \n\nConstraints:\n- \n\nPotential experiments:\n- [ ]\n",
                    "会话背景：\n- 主题：\n- 目标：\n\n想法池：\n- \n\n约束条件：\n- \n\n可执行实验：\n- [ ]\n",
                ),
                "summary_template": "brainstorm",
            },
            "default_views": [],
        },

        # ── 20. Project Execution Hub ──────────────────────────────────────────
        {
            "id": "tpl-project-os",
            "title": L("Project Execution Hub", "项目执行中心"),
            "icon": "🧭",
            "category": cat["planning"],
            "description": L(
                "Notion-style all-project workspace with status, owners, timeline and risks",
                "Notion 风格项目总览：状态、负责人、时间线、风险",
            ),
            "content": {"text": L(
                "## Project Execution Hub\n\nPlan, execute, and review projects in one place.\n",
                "## 项目执行中心\n\n在一个页面里完成项目规划、执行与复盘。\n",
            )},
            "default_views": [
                {"id": "overview", "type": "document", "title": L("Overview", "总览"), "icon": "📝",
                 "data": {"text": L(
                     "## Project Execution Hub\n\n**Portfolio owner:** \n**Review cadence:** Weekly\n**North-star goal:** \n\n---\n\n## Operating Rules\n\n1. Every project must have one owner and a target end date.\n2. Status updates happen before weekly review.\n3. Blocked projects must include unblock action + owner.\n\n---\n\n## Weekly PM Review Checklist\n\n- [ ] Top 3 priorities for this week are clear\n- [ ] Any blocked project has escalation owner\n- [ ] Budget/risk changes are reflected in project table\n- [ ] Close completed items and archive stale work\n",
                     "## 项目执行中心\n\n**项目组合负责人:** \n**回顾节奏:** 每周\n**核心目标:** \n\n---\n\n## 运行规则\n\n1. 每个项目必须有唯一负责人和目标结束日期。\n2. 周会前必须完成状态更新。\n3. 若项目阻塞，必须写明解阻动作和责任人。\n\n---\n\n## 每周项目评审清单\n\n- [ ] 本周 Top 3 优先级已明确\n- [ ] 所有阻塞项目已指定升级责任人\n- [ ] 预算与风险变动已同步到项目表\n- [ ] 已完成事项已收口，过期事项已清理\n",
                 )}},
                {"id": "all_projects", "type": "database", "title": L("All Projects", "所有项目"), "icon": "🗂️",
                 "dbData": {
                     "schema": {
                         "columns": [
                             {"key": "title", "title": L("Project Name", "项目名称"), "type": "title"},
                             {"key": "ai_summary", "title": L("AI Summary", "AI 总结"), "type": "text"},
                             {"key": "priority", "title": L("Priority", "优先级"), "type": "select",
                              "options": [{"value": "P0"}, {"value": "P1"}, {"value": "P2"}, {"value": "P3"}]},
                             {"key": "team", "title": L("Team", "团队"), "type": "multi_select",
                              "options": [{"value": L("Product", "产品")}, {"value": L("Engineering", "工程")},
                                          {"value": L("Design", "设计")}, {"value": L("Operations", "运营")},
                                          {"value": L("Sales", "销售")}]},
                             {"key": "owner", "title": L("Owner", "负责人"), "type": "text"},
                             {"key": "status", "title": L("Status", "状态"), "type": "status",
                              "options": [{"value": L("Not started", "未开始")}, {"value": L("In progress", "进行中")},
                                          {"value": L("Blocked", "阻塞")}, {"value": L("Completed", "已完成")},
                                          {"value": L("Cancelled", "已取消")}]},
                             {"key": "start_date", "title": L("Start Date", "开始日期"), "type": "date"},
                             {"key": "end_date", "title": L("End Date", "结束日期"), "type": "date"},
                             {"key": "progress", "title": L("Progress %", "进度 %"), "type": "number"},
                             {"key": "budget", "title": L("Budget", "预算"), "type": "number"},
                             {"key": "actual_spend", "title": L("Actual Spend", "当前花费"), "type": "number"},
                             {"key": "risk_level", "title": L("Risk", "风险等级"), "type": "select",
                              "options": [{"value": L("Low", "低")}, {"value": L("Medium", "中")}, {"value": L("High", "高")}]},
                             {"key": "milestone", "title": L("Milestone", "里程碑"), "type": "text"},
                             {"key": "attachment", "title": L("Attachment URL", "附件链接"), "type": "url"},
                         ],
                         "groupBy": "status",
                         "dateField": "end_date",
                     },
                     "rows": [
                         {
                             "_id": "pos-1",
                             "title": L("Workspace Template Upgrade", "工作区模板能力升级"),
                             "ai_summary": L("Upgrade templates to support reusable blocks and voice memo flows.", "升级模板能力，支持可复用区块与语音速记流程。"),
                             "priority": "P0",
                             "team": f"{L('Product', '产品')},{L('Engineering', '工程')}",
                             "owner": L("Liu Carson", "Liu Carson"),
                             "status": L("In progress", "进行中"),
                             "start_date": "2026-02-20",
                             "end_date": "2026-03-15",
                             "progress": 52,
                             "budget": 120000,
                             "actual_spend": 63000,
                             "risk_level": L("Medium", "中"),
                             "milestone": L("Voice memo template parity", "语音速记模板对齐"),
                             "attachment": "",
                         },
                         {
                             "_id": "pos-2",
                             "title": L("Customer 360 Delivery", "Customer 360 交付"),
                             "ai_summary": L("Integrate CRM, operations and finance data into one customer timeline.", "打通 CRM、运营和财务数据，形成客户全景时间线。"),
                             "priority": "P1",
                             "team": f"{L('Product', '产品')},{L('Operations', '运营')}",
                             "owner": L("Ops Lead", "运营负责人"),
                             "status": L("Not started", "未开始"),
                             "start_date": "2026-03-01",
                             "end_date": "2026-04-10",
                             "progress": 0,
                             "budget": 80000,
                             "actual_spend": 0,
                             "risk_level": L("Low", "低"),
                             "milestone": L("Data source alignment", "数据源口径对齐"),
                             "attachment": "",
                         },
                     ],
                 }},
                {"id": "my_projects", "type": "table", "title": L("My Projects", "我的项目"), "icon": "👤",
                 "columns": [COL("project", "Project", "项目"), COL("owner", "Owner", "负责人"),
                             COL("priority", "Priority", "优先级"), COL("status", "Status", "状态"),
                             COL("next_action", "Next Action", "下一步动作"), COL("due", "Due", "截止")],
                 "rows": [
                     ROW(project=L("Workspace Template Upgrade", "工作区模板能力升级"), owner=L("Liu Carson", "Liu Carson"), priority="P0",
                         status=L("In progress", "进行中"), next_action=L("Finish voice memo polish", "完成语音速记打磨"), due="2026-03-15"),
                 ]},
                {"id": "timeline", "type": "table", "title": L("Gantt Snapshot", "甘特快照"), "icon": "📆",
                 "columns": [COL("project", "Project", "项目"), COL("start", "Start", "开始"),
                             COL("end", "End", "结束"), COL("progress", "Progress %", "进度 %"),
                             COL("risk", "Risk", "风险"), COL("notes", "Notes", "备注")],
                 "rows": [
                     ROW(project=L("Workspace Template Upgrade", "工作区模板能力升级"), start="2026-02-20", end="2026-03-15", progress="52", risk=L("Medium", "中"), notes=""),
                     ROW(project=L("Customer 360 Delivery", "Customer 360 交付"), start="2026-03-01", end="2026-04-10", progress="0", risk=L("Low", "低"), notes=""),
                 ]},
                {"id": "execution", "type": "task_tracker", "title": L("Execution Tasks", "执行任务"), "icon": "✅",
                 "data": {"_tasks": [
                     TASK("po1", "Run weekly project review and update statuses", "执行每周项目评审并更新状态", priority="high"),
                     TASK("po2", "Escalate blocked project owners with clear unblock path", "对阻塞项目进行升级并明确解阻路径", priority="high"),
                     TASK("po3", "Audit budget variance and risk changes", "审查预算偏差与风险变化", priority="medium"),
                     TASK("po4", "Close completed milestones and archive stale items", "关闭已完成里程碑并归档过期事项", priority="medium"),
                 ]}},
            ],
        },

        # ── 21. CRM Tracker ────────────────────────────────────────────────────
        {
            "id": "tpl-crm-tracker",
            "title": L("CRM Tracker", "CRM 追踪器"),
            "icon": "🤝",
            "category": cat["business"],
            "description": L(
                "Leads & deals tracking",
                "线索、商机管理",
            ),
            "content": {"text": L(
                "## CRM Tracker\n\nTrack leads, deals, and customer relationships.\n",
                "## CRM 追踪器\n\n追踪线索、商机与客户关系。\n",
            )},
            "default_views": [
                {"id": "strategy", "type": "document", "title": L("Strategy", "策略"), "icon": "📝",
                 "data": {"text": L(
                     "## CRM Strategy\n\n**Target customer:** \n**ICP (Ideal Customer Profile):** \n\n---\n\n## Sales Stages\n\n1. **Lead** — Unqualified prospect\n2. **Qualified** — Budget, authority, need, timeline confirmed\n3. **Proposal** — Proposal sent\n4. **Negotiation** — Contract review\n5. **Won / Lost** — Deal closed\n\n---\n\n## Qualification Criteria (BANT)\n\n- **Budget:** Does the prospect have budget allocated?\n- **Authority:** Are we talking to the decision-maker?\n- **Need:** Do they have a clear pain we solve?\n- **Timeline:** When do they need a solution?\n",
                     "## CRM 策略\n\n**目标客户:** \n**理想客户画像 (ICP):** \n\n---\n\n## 销售阶段\n\n1. **线索** — 未经资质确认的潜在客户\n2. **已资质** — 预算、决策权、需求、时间线已确认\n3. **提案** — 已发送报价方案\n4. **谈判** — 合同审核中\n5. **成交/流失** — 交易已关闭\n\n---\n\n## 资质确认标准 (BANT)\n\n- **预算(Budget):** 客户是否有预算？\n- **授权(Authority):** 是否在与决策者沟通？\n- **需求(Need):** 是否有我们能解决的明确痛点？\n- **时间线(Timeline):** 他们何时需要解决方案？\n",
                 )}},
                {"id": "deals", "type": "database", "title": L("Deals", "商机"), "icon": "🗃️",
                 "dbData": {
                     "schema": {
                         "columns": [
                             {"key": "title", "title": L("Company", "公司"), "type": "title"},
                             {"key": "stage", "title": L("Stage", "阶段"), "type": "status",
                              "options": [{"value": L("Lead", "线索")}, {"value": L("Qualified", "已资质")},
                                          {"value": L("Proposal", "提案")}, {"value": L("Negotiation", "谈判")},
                                          {"value": L("Won", "成交")}, {"value": L("Lost", "流失")}]},
                             {"key": "value", "title": L("Deal Value", "商机金额"), "type": "number"},
                             {"key": "contact", "title": L("Contact", "联系人"), "type": "text"},
                             {"key": "close_date", "title": L("Close Date", "预计成交日期"), "type": "date"},
                             {"key": "owner", "title": L("Owner", "负责人"), "type": "text"},
                             {"key": "notes", "title": L("Notes", "备注"), "type": "text"},
                         ],
                         "groupBy": "stage",
                         "dateField": "close_date",
                     },
                     "rows": [],
                 }},
            ],
        },
    ]



# Backward-compat alias: get_builtin_templates("en") is the single source of truth
BUILTIN_TEMPLATES = get_builtin_templates("en")


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/setup")
async def setup_default_workspaces(ctx: dict = Depends(get_current_user_with_tenant)):
    """Auto-create default Private and Team workspaces if none exist for this user."""
    db = ctx["db"]
    user_id = ctx["sub"]

    # Verify tenant schema is active (workspaces table must exist)
    try:
        await db.execute(text("SELECT 1 FROM workspaces LIMIT 0"))
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Tenant schema not provisioned")

    # Ensure workspace_members table exists (idempotent DDL, committed immediately)
    try:
        await db.execute(text("""
            CREATE TABLE IF NOT EXISTS workspace_members (
                workspace_id UUID NOT NULL,
                user_id UUID NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'editor',
                added_by UUID,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (workspace_id, user_id)
            )
        """))
        await db.commit()
    except Exception:
        await db.rollback()

    # Add template_description column if it doesn't exist yet
    try:
        await db.execute(text("ALTER TABLE pages ADD COLUMN template_description VARCHAR(500) DEFAULT ''"))
        await db.commit()
    except Exception:
        await db.rollback()

    # Ensure page_favorites table exists (for favorites feature)
    try:
        await db.execute(text("""
            CREATE TABLE IF NOT EXISTS page_favorites (
                user_id UUID NOT NULL,
                page_id UUID NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (user_id, page_id)
            )
        """))
        await db.commit()
    except Exception:
        await db.rollback()

    private_id = str(uuid.uuid4())
    team_id = str(uuid.uuid4())

    # Atomic INSERT: only inserts if no workspaces exist for this user.
    result = await db.execute(
        text("""INSERT INTO workspaces (id, name, visibility, owner_id, icon, description)
                SELECT :id, :name, :vis, :owner, :icon, :descr
                WHERE NOT EXISTS (
                    SELECT 1 FROM workspaces WHERE owner_id = :uid AND is_active = TRUE
                )"""),
        {"id": private_id, "name": "个人空间", "vis": "private", "owner": user_id,
         "icon": "🔒", "descr": "个人笔记与草稿", "uid": user_id}
    )
    if result.rowcount == 0:
        return {"status": "already_setup"}

    await db.execute(
        text("""INSERT INTO workspaces (id, name, visibility, owner_id, icon, description)
                VALUES (:id, :name, :vis, :owner, :icon, :descr)"""),
        {"id": team_id, "name": "团队空间", "vis": "team", "owner": user_id,
         "icon": "👥", "descr": "团队共享知识库"}
    )
    await db.commit()
    return {"status": "created", "private_id": private_id, "team_id": team_id}


@router.post("/workspaces")
async def create_workspace(body: WorkspaceCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    user_id = ctx["sub"]
    # Each user may only have one private workspace — enforce at API level
    if body.visibility == "private":
        existing = await db.execute(
            text("SELECT id FROM workspaces WHERE owner_id = :uid AND visibility = 'private' AND is_active = TRUE"),
            {"uid": user_id}
        )
        if existing.fetchone():
            raise HTTPException(status_code=409, detail="A private workspace already exists for this user")
    ws_id = str(uuid.uuid4())
    await db.execute(
        text("""INSERT INTO workspaces (id, name, visibility, owner_id, icon, description)
                VALUES (:id, :name, :vis, :owner, :icon, :descr)"""),
        {"id": ws_id, "name": body.name, "vis": body.visibility,
         "owner": user_id, "icon": body.icon, "descr": body.description}
    )
    
    # If it's a team workspace, automatically add the creator as an admin member
    if body.visibility == "team":
        await db.execute(
            text("""INSERT INTO workspace_members (workspace_id, user_id, role, added_by)
                    VALUES (:wsid, :uid, 'admin', :added_by)"""),
            {"wsid": ws_id, "uid": user_id, "added_by": user_id}
        )
        
    await db.commit()
    return {"id": ws_id, "name": body.name, "visibility": body.visibility, "icon": body.icon}


@router.get("/sidebar/tree")
async def list_sidebar_tree(ctx: dict = Depends(get_current_user_with_tenant)):
    """
    Notion-style Sidebar Tree: Returns nested pages structure.
    Optimized to fetch all pages and construct tree in memory to avoid N+1 queries.
    """
    user_id = ctx["sub"]
    db = ctx["db"]
    
    # 1. Fetch Workspaces (include current user's membership role for permission checks)
    ws_res = await db.execute(
        text("""SELECT w.id, w.name, w.visibility, w.icon, w.owner_id, w.created_at,
                       COALESCE(w.position, 0) AS position,
                       wm.role AS current_user_role
                FROM workspaces w
                LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = :uid
                WHERE w.is_active = TRUE
                  AND (w.owner_id = :uid OR w.visibility = 'team' OR wm.user_id IS NOT NULL)
                ORDER BY COALESCE(w.position, 0) ASC, w.created_at ASC"""),
        {"uid": user_id}
    )
    workspaces = [dict(r._mapping) for r in ws_res.fetchall()]
    
    # 2. Fetch All Pages (Non-archived)
    # Note: Fetching all might be heavy for huge orgs, but standard for Notion-like sidebar load
    pages_res = await db.execute(
        text("""SELECT id, workspace_id, parent_page_id, title, icon, position 
                FROM pages 
                WHERE is_archived = FALSE AND (is_template IS NULL OR is_template = FALSE)
                ORDER BY position ASC, created_at ASC""")
    )
    all_pages = [dict(r._mapping) for r in pages_res.fetchall()]
    
    # 3. Construct Tree
    # Group pages by workspace and parent
    pages_by_ws = {} # { ws_id: [root_pages] }
    pages_by_parent = {} # { parent_id: [child_pages] }
    
    for p in all_pages:
        p["children"] = [] # Initialize children
        pid = str(p["parent_page_id"]) if p["parent_page_id"] else None
        wsid = str(p["workspace_id"])
        
        if pid:
            if pid not in pages_by_parent:
                pages_by_parent[pid] = []
            pages_by_parent[pid].append(p)
        else:
            if wsid not in pages_by_ws:
                pages_by_ws[wsid] = []
            pages_by_ws[wsid].append(p)

    # Recursive function to populate children
    def populate_children(page_list):
        for p in page_list:
            pid = str(p["id"])
            if pid in pages_by_parent:
                p["children"] = pages_by_parent[pid]
                populate_children(p["children"])
    
    # Build final tree structure
    tree = []
    for ws in workspaces:
        ws_id = str(ws["id"])
        root_pages = pages_by_ws.get(ws_id, [])
        populate_children(root_pages)
        
        tree.append({
            "type": "workspace",
            "id": ws_id,
            "name": ws["name"],
            "icon": ws["icon"],
            "visibility": ws["visibility"],
            "owner_id": str(ws["owner_id"]) if ws.get("owner_id") else None,
            "current_user_role": ws.get("current_user_role"),  # 'admin'|'editor'|'viewer'|None
            "position": ws.get("position", 0),
            "children": root_pages
        })
        
    return tree

@router.get("/workspaces")
async def list_workspaces(ctx: dict = Depends(get_current_user_with_tenant)):
    user_id = ctx["sub"]
    # Include workspaces: owned by user, OR visibility=team, OR user is an explicit member
    result = await ctx["db"].execute(
        text("""SELECT DISTINCT w.id, w.name, w.visibility, w.owner_id, w.icon, w.description, w.created_at
                FROM workspaces w
                LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = :uid
                WHERE w.is_active = TRUE
                  AND (w.owner_id = :uid OR w.visibility = 'team' OR wm.user_id IS NOT NULL)
                ORDER BY w.visibility DESC, w.created_at ASC"""),
        {"uid": user_id}
    )
    rows = [dict(row._mapping) for row in result.fetchall()]
    # Attach member_count for team/shared workspaces
    for row in rows:
        row["is_owned"] = str(row.get("owner_id")) == user_id
    return rows


_WORKSPACE_UPDATE_FIELDS = {"name", "type", "visibility", "icon", "description", "is_active", "position"}


@router.patch("/workspaces/{workspace_id}")
async def update_workspace(workspace_id: str, body: WorkspaceUpdate,
                           ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    # exclude_unset=True: only include fields explicitly sent by the client.
    # This allows null values through (to clear DB fields) while ignoring truly absent fields.
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "no-op"}
    set_clause, params = build_update_clause(updates, _WORKSPACE_UPDATE_FIELDS)
    if not set_clause:
        return {"status": "no-op"}
    params["id"] = workspace_id
    await db.execute(
        text(f"UPDATE workspaces SET {set_clause}, updated_at = NOW() WHERE id = :id"), params
    )
    await db.commit()
    return {"status": "updated"}


@router.delete("/workspaces/{workspace_id}")
async def delete_workspace(workspace_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    # Private workspaces cannot be deleted — they are the user's permanent personal space
    check = await db.execute(
        text("SELECT visibility FROM workspaces WHERE id = :id AND owner_id = :uid AND is_active = TRUE"),
        {"id": workspace_id, "uid": ctx["sub"]}
    )
    ws = check.fetchone()
    if ws and ws.visibility == "private":
        raise HTTPException(status_code=403, detail="Private workspace cannot be deleted")
    await db.execute(
        text("UPDATE workspaces SET is_active = FALSE WHERE id = :id AND owner_id = :uid"),
        {"id": workspace_id, "uid": ctx["sub"]}
    )
    await db.commit()
    return {"status": "deleted"}


@router.get("/workspaces/{workspace_id}/pages")
async def list_pages(
    workspace_id: str,
    search: str = "",
    sort: str = "updated_at",
    sort_dir: str = "desc",
    skip: int = 0,
    limit: int = 50,
    content_type: str = "",  # filter by content._type: 'task_tracker'|'voice_memo'|'' (all)
    parent: str = "",  # 'root' = top-level only, uuid = children of that page, '' = all
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    # Whitelist sort fields to prevent SQL injection
    _allowed = {"updated_at", "created_at", "title", "position"}
    sort = sort if sort in _allowed else "updated_at"
    direction = "DESC" if sort_dir.lower() == "desc" else "ASC"

    where = "p.workspace_id = :wsid AND p.is_archived = FALSE AND (p.is_template IS NULL OR p.is_template = FALSE)"
    params: dict = {"wsid": workspace_id}

    # Filter by parent_page_id hierarchy
    if parent.strip() == "root":
        where += " AND p.parent_page_id IS NULL"
    elif parent.strip():
        where += " AND p.parent_page_id = :parent_id"
        params["parent_id"] = parent.strip()

    if search.strip():
        where += " AND LOWER(p.title) LIKE :search"
        params["search"] = f"%{search.strip().lower()}%"

    if content_type.strip():
        where += " AND p.content->>'_type' = :ctype"
        params["ctype"] = content_type.strip()

    # Total count
    cnt = await db.execute(text(f"SELECT COUNT(*) FROM pages p WHERE {where}"), params)
    total = cnt.scalar() or 0

    # Paginated rows — also expose content_type and child_count for badge/folder rendering
    rows = await db.execute(
        text(f"""
            SELECT p.id, p.workspace_id, p.parent_page_id, p.title, p.position, p.icon,
                   p.cover_emoji, p.is_archived, p.is_template, p.template_category,
                   p.created_at, p.updated_at,
                   p.content->>'_type' AS content_type,
                   (SELECT COUNT(*) FROM pages c WHERE c.parent_page_id = p.id AND c.is_archived = FALSE) AS child_count
            FROM pages p
            WHERE {where}
            ORDER BY p.{sort} {direction}
            LIMIT :lim OFFSET :skip
        """),
        {**params, "lim": limit, "skip": skip},
    )
    pages = [dict(r._mapping) for r in rows.fetchall()]
    return {"pages": pages, "total": total}


@router.post("/pages")
async def create_page(body: PageCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    # Validate workspace exists
    ws = await db.execute(
        text("SELECT id FROM workspaces WHERE id = :id AND is_active = TRUE"),
        {"id": body.workspace_id}
    )
    if not ws.fetchone():
        raise HTTPException(status_code=404, detail="Workspace not found")
    # Validate title length
    if len(body.title) > 500:
        raise HTTPException(status_code=400, detail="Title too long (max 500 characters)")
    page_id = str(uuid.uuid4())
    await db.execute(
        text("""INSERT INTO pages (id, workspace_id, parent_page_id, title, content, position, icon, created_by)
                VALUES (:id, :wsid, :parent, :title, CAST(:content AS JSONB), :pos, :icon, :creator)"""),
        {"id": page_id, "wsid": body.workspace_id, "parent": body.parent_page_id,
         "title": body.title, "content": json.dumps(body.content or {}), "pos": body.position,
         "icon": body.icon, "creator": ctx["sub"]}
    )
    await db.commit()
    return {"id": page_id, "title": body.title, "workspace_id": body.workspace_id}


class AICreatePageRequest(BaseModel):
    workspace_id: str
    instruction: str  # 用户的自然语言指令
    context_data: Optional[dict] = None # 可选的 CRM/ERP 关联上下文

@router.post("/pages/ai-generate")
async def ai_generate_page(body: AICreatePageRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    """
    真正的 AI 联动 Agent：自动检测指令，查询数据库，生成业务页面。
    """
    from app.services.ai.provider import generate_json_for_tenant
    db = ctx["db"]
    instr = body.instruction.lower()
    
    context_text = ""
    # ── 1. 简单的意图识别与数据检索 ──────────────────────────────────
    if any(k in instr for k in ["客户", "crm", "线索", "contact", "lead"]):
        res = await db.execute(text("SELECT full_name, email, company, status FROM leads LIMIT 10"))
        data = [dict(row._mapping) for row in res.fetchall()]
        context_text += f"\nRecent CRM Leads: {json.dumps(data)}"
        
    if any(k in instr for k in ["报价", "quote", "price", "money"]):
        res = await db.execute(text("SELECT quote_number, total_amount, currency, status FROM quotations LIMIT 10"))
        data = [dict(row._mapping) for row in res.fetchall()]
        context_text += f"\nRecent Quotations: {json.dumps(data)}"

    if any(k in instr for k in ["货运", "ship", "logistics", "船", "vessel"]):
        res = await db.execute(text("SELECT vessel_name, container_number, etd, eta, status FROM shipments LIMIT 10"))
        data = [dict(row._mapping) for row in res.fetchall()]
        context_text += f"\nActive Shipments: {json.dumps(data)}"

    # ── 2. 构造增强提示词 ───────────────────────────────────────────
    # Fetch user AI profile for personalization
    profile_res = await db.execute(
        text("SELECT style_preference, custom_instructions FROM user_ai_profiles WHERE user_id = :uid"),
        {"uid": ctx["sub"]}
    )
    profile = profile_res.fetchone()
    style = profile.style_preference if profile else "professional"
    custom_ins = profile.custom_instructions if profile else ""

    prompt = f"""
    You are a professional Enterprise AI Agent for a Trading ERP. 
    User Instruction: {body.instruction}
    
    Personalization Preferences:
    - Writing Style: {style}
    - Custom Instructions: {custom_ins}
    
    Business Context (from Database):
    {context_text}
    
    Based on the instruction and context, create a high-quality structured page.
    Use tables for data lists, headings for sections, and bullet points for summaries.
    
    Format your response as a JSON list of Block objects:
    [
      {{"type": "heading", "content": "..."}},
      {{"type": "paragraph", "content": "..."}},
      {{"type": "bullet_list", "items": ["...", "..."]}},
      {{"type": "table", "columns": ["Col1", "Col2"], "rows": [ ["R1C1", "R1C2"], ["R2C1", "R2C2"] ]}}
    ]
    """
    
    try:
        blocks = await generate_json_for_tenant(
            db, ctx["tenant_id"], prompt,
            system_instruction="You are a professional enterprise assistant.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Generation failed: {str(e)}")

    page_id = str(uuid.uuid4())
    title = "AI 生成页面"
    for b in blocks:
        if b.get("type") == "heading":
            title = b.get("content", title)
            break
    
    await db.execute(
        text("""INSERT INTO pages (id, workspace_id, title, content, created_by)
                VALUES (:id, :wsid, :title, CAST(:content AS JSONB), :creator)"""),
        {"id": page_id, "wsid": body.workspace_id, "title": title,
         "content": json.dumps(blocks), "creator": ctx["sub"]}
    )
    await db.commit()
    return {"id": page_id, "title": title, "blocks": blocks}

@router.get("/pages/{page_id}")
async def get_page(page_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(
        text("SELECT * FROM pages WHERE id = :id AND is_archived = FALSE"),
        {"id": page_id}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Page not found")
    return dict(row._mapping)


_PAGE_UPDATE_FIELDS = {"title", "content", "position", "icon", "cover_emoji", "is_archived", "is_template", "template_category", "parent_page_id", "workspace_id"}


@router.patch("/pages/{page_id}")
async def update_page(page_id: str, body: PageUpdate,
                      ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    # exclude_unset=True: only fields explicitly sent by the client are included.
    # Allows null values to clear DB fields (e.g. cover_emoji=null removes the cover).
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates = {k: v for k, v in updates.items() if k in _PAGE_UPDATE_FIELDS}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # ── Archive (delete) permission check ────────────────────────────────────
    if updates.get("is_archived") is True:
        user_id = ctx["sub"]
        system_role = ctx.get("role", "")
        # Fetch workspace info for this page
        page_ws = await db.execute(
            text("SELECT workspace_id FROM pages WHERE id = :id"),
            {"id": page_id}
        )
        page_row = page_ws.fetchone()
        if page_row:
            ws_res = await db.execute(
                text("SELECT visibility, owner_id FROM workspaces WHERE id = :id"),
                {"id": str(page_row.workspace_id)}
            )
            ws_row = ws_res.fetchone()
            if ws_row:
                if ws_row.visibility == "private":
                    # Personal space: only the workspace owner may delete
                    if str(ws_row.owner_id) != user_id:
                        raise HTTPException(
                            status_code=403,
                            detail="只有空间所有者可以删除个人空间中的文件"
                        )
                elif ws_row.visibility == "team":
                    # Team space: system admin OR workspace admin/editor may delete
                    if system_role not in ("admin", "platform_admin", "tenant_admin"):
                        member_res = await db.execute(
                            text("""SELECT role FROM workspace_members
                                    WHERE workspace_id = :wsid AND user_id = :uid"""),
                            {"wsid": str(page_row.workspace_id), "uid": user_id}
                        )
                        member = member_res.fetchone()
                        if not member or member.role not in ("admin", "editor"):
                            raise HTTPException(
                                status_code=403,
                                detail="只有管理员或编辑者可以删除团队空间中的文件"
                            )
    # Build SET clause; JSONB content must use CAST to avoid asyncpg type errors
    set_parts = []
    for k in list(updates.keys()):
        if k == "content":
            set_parts.append("content = CAST(:content AS JSONB)")
            updates["content"] = json.dumps(updates["content"])
        else:
            set_parts.append(f"{k} = :{k}")
    set_clause = ", ".join(set_parts)
    updates["id"] = page_id
    updates["updater"] = ctx["sub"]
    result = await db.execute(
        text(f"UPDATE pages SET {set_clause}, updated_by = :updater, updated_at = NOW() WHERE id = :id"),
        updates
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Page not found")
    await db.commit()
    return {"status": "updated"}


@router.delete("/pages/{page_id}")
async def archive_page(page_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(
        text("UPDATE pages SET is_archived = TRUE WHERE id = :id AND is_archived = FALSE"),
        {"id": page_id}
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Page not found")
    await ctx["db"].commit()
    return {"status": "archived"}


@router.get("/user-tasks")
async def get_user_tasks(ctx: dict = Depends(get_current_user_with_tenant)):
    """Return all tasks from every task_tracker page in this tenant, flattened."""
    db = ctx["db"]
    result = await db.execute(
        text("""
            SELECT id AS page_id, title AS page_title,
                   content->'_tasks' AS tasks
            FROM pages
            WHERE (content->>'_type') = 'task_tracker'
              AND is_archived = FALSE
        """)
    )
    rows = result.fetchall()
    all_tasks = []
    for row in rows:
        task_list = row.tasks if row.tasks is not None else []
        if isinstance(task_list, str):
            import json as _json
            try:
                task_list = _json.loads(task_list)
            except Exception:
                task_list = []
        if not isinstance(task_list, list):
            task_list = []
        for task in task_list:
            all_tasks.append({
                **task,
                "page_id": row.page_id,
                "page_title": row.page_title,
            })
    return all_tasks


# ── Voice transcription & audio upload ─────────────────────────────────────────
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")


@router.post("/voice/transcribe")
async def transcribe_voice(
    file: UploadFile = File(...),
    language: str = "zh",
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Upload audio → Gemini transcription → return text."""
    allowed_languages = {"en", "zh", "ja", "it", "es", "pt"}
    if language not in allowed_languages:
        language = "en"
    tenant_slug = ctx.get("tenant_slug", "shared")
    tmp_dir = os.path.join(UPLOAD_DIR, tenant_slug, "voice_tmp")
    os.makedirs(tmp_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1] or ".webm"
    tmp_path = os.path.join(tmp_dir, f"{uuid.uuid4().hex}{ext}")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file too large (max 25MB)")
    async with aiofiles.open(tmp_path, "wb") as f:
        await f.write(content)

    try:
        from app.services.ai.provider import transcribe_audio_for_tenant
        transcript = await transcribe_audio_for_tenant(
            ctx["db"], ctx.get("tenant_id"), tmp_path, language
        )
        return {"transcript": transcript}
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Transcription failed: {e}")
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass


@router.post("/voice/upload-audio")
async def upload_voice_audio(
    file: UploadFile = File(...),
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Permanently save a voice recording for playback."""
    tenant_slug = ctx.get("tenant_slug", "shared")
    voice_dir = os.path.join(UPLOAD_DIR, tenant_slug, "voice")
    os.makedirs(voice_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1] or ".webm"
    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(voice_dir, stored_name)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file too large (max 50MB)")
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    url = f"/uploads/{tenant_slug}/voice/{stored_name}"
    return {"url": url, "filename": stored_name}


# ── File Upload ────────────────────────────────────────────────────────────────

MIME_TO_ATT_TYPE = {
    "image": "image",
    "video": "video",
    "audio": "audio",
    "application/pdf": "file",
    "text": "file",
    "application": "file",
}

def _detect_att_type(mime: str) -> str:
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"
    return "file"


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    ctx: dict = Depends(get_current_user_with_tenant),
):
    tenant_slug = ctx.get("tenant_slug", "shared")
    tenant_dir = os.path.join(UPLOAD_DIR, tenant_slug)
    os.makedirs(tenant_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1].lower()
    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(tenant_dir, stored_name)

    content = await file.read()
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    att_type = _detect_att_type(mime)
    url = f"/uploads/{tenant_slug}/{stored_name}"

    return {
        "url": url,
        "name": file.filename or stored_name,
        "type": att_type,
        "size": len(content),
        "mime": mime,
    }


# ── Authenticated file serving ─────────────────────────────────────────────────
# Short-lived signed tokens: token → (file_path, expiry_timestamp)
_file_tokens: dict[str, tuple[str, float]] = {}


@router.get("/file-token")
async def get_file_token(
    path: str,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """
    Exchange a file path (e.g. /uploads/tenant/uuid.pdf) for a short-lived
    download token. Requires valid JWT — ensures only authenticated tenant
    users can open uploaded files.
    """
    # Purge expired tokens
    now = time.time()
    expired = [k for k, (_, exp) in list(_file_tokens.items()) if exp < now]
    for k in expired:
        _file_tokens.pop(k, None)

    # Validate that the path belongs to this tenant
    tenant_slug = ctx.get("tenant_slug", "")
    expected_prefix = f"/uploads/{tenant_slug}/"
    if not path.startswith(expected_prefix) and not path.startswith("/uploads/shared/"):
        raise HTTPException(status_code=403, detail="Access denied to this file")

    token = secrets.token_urlsafe(32)
    _file_tokens[token] = (path, now + 600)  # valid for 10 minutes
    return {"token": token, "signed_url": f"/api/workspace/file?t={token}"}


@router.get("/file")
async def serve_file(t: str):
    """Serve a file using a short-lived signed token (no bearer token needed — for browser tabs)."""
    entry = _file_tokens.get(t)
    if not entry:
        raise HTTPException(status_code=403, detail="Invalid or expired download token")
    file_path_url, expiry = entry
    if time.time() > expiry:
        _file_tokens.pop(t, None)
        raise HTTPException(status_code=403, detail="Download token has expired")

    # Resolve /uploads/... → absolute path on disk
    relative = file_path_url.lstrip("/")  # "uploads/tenant/uuid.pdf"
    # UPLOAD_DIR is .../backend/uploads; relative starts with "uploads/"
    abs_path = os.path.normpath(os.path.join(
        os.path.dirname(__file__), "..", "..", relative
    ))
    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="File not found")

    mime, _ = mimetypes.guess_type(abs_path)
    return FileResponse(
        abs_path,
        media_type=mime or "application/octet-stream",
        filename=os.path.basename(abs_path),
    )


class OverwriteWithTemplate(BaseModel):
    template_id: str
    lang: str = "en"


async def _resolve_template_payload(db, template_id: str, lang: str = "en") -> tuple[str, Any, Optional[str]]:
    builtin = next((t for t in get_builtin_templates(lang) if t["id"] == template_id), None)
    if not builtin:
        builtin = next((t for t in get_builtin_templates("en") if t["id"] == template_id), None)
    if builtin:
        if builtin.get("default_views"):
            content = {"_views": builtin["default_views"]}
        else:
            content = builtin["content"]
        return builtin["title"], content, builtin["icon"]

    result = await db.execute(
        text("SELECT title, content, icon FROM pages WHERE id = :id AND is_template = TRUE AND is_archived = FALSE"),
        {"id": template_id}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    return row.title, row.content, row.icon


def _render_template_value(value: Any, variables: dict[str, str]) -> Any:
    if isinstance(value, str):
        def repl(match: re.Match[str]) -> str:
            key = (match.group(1) or "").strip().lower()
            return variables.get(key, match.group(0))
        return re.sub(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", repl, value)
    if isinstance(value, list):
        return [_render_template_value(v, variables) for v in value]
    if isinstance(value, dict):
        return {k: _render_template_value(v, variables) for k, v in value.items()}
    return value


async def _build_template_variables(db, ctx: dict, *, page_id: Optional[str] = None, workspace_id: Optional[str] = None) -> dict[str, str]:
    now = datetime.now()
    next_week = now + timedelta(days=7)
    sub = ctx.get("sub")
    email = ctx.get("email") or ""
    full_name = ""

    if sub:
        user_result = await db.execute(
            text("SELECT COALESCE(full_name, '') as full_name, COALESCE(email, '') as email FROM users WHERE id = :id"),
            {"id": sub},
        )
        row = user_result.fetchone()
        if row:
            full_name = row.full_name or ""
            if row.email:
                email = row.email

    ws_name = ""
    page_title = ""
    if page_id:
        page_result = await db.execute(
            text("""SELECT p.title as page_title, COALESCE(w.name, '') as ws_name
                    FROM pages p
                    LEFT JOIN workspaces w ON w.id = p.workspace_id
                    WHERE p.id = :id"""),
            {"id": page_id},
        )
        page_row = page_result.fetchone()
        if page_row:
            page_title = page_row.page_title or ""
            ws_name = page_row.ws_name or ""
    elif workspace_id:
        ws_result = await db.execute(
            text("SELECT COALESCE(name, '') as ws_name FROM workspaces WHERE id = :id"),
            {"id": workspace_id},
        )
        ws_row = ws_result.fetchone()
        if ws_row:
            ws_name = ws_row.ws_name or ""

    user_name = full_name or (email.split("@")[0] if email else "")
    weekday_en = now.strftime("%A")
    weekday_zh_map = {
        "Monday": "星期一",
        "Tuesday": "星期二",
        "Wednesday": "星期三",
        "Thursday": "星期四",
        "Friday": "星期五",
        "Saturday": "星期六",
        "Sunday": "星期日",
    }
    tenant_slug = str(ctx.get("tenant_slug") or "")
    return {
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M"),
        "datetime": now.strftime("%Y-%m-%d %H:%M"),
        "year": now.strftime("%Y"),
        "month": now.strftime("%m"),
        "day": now.strftime("%d"),
        "quarter": str(((now.month - 1) // 3) + 1),
        "next_week": next_week.strftime("%Y-%m-%d"),
        "next_weekday": next_week.strftime("%A"),
        "weekday": weekday_en,
        "weekday_zh": weekday_zh_map.get(weekday_en, weekday_en),
        "user": user_name,
        "user_name": user_name,
        "email": email,
        "user_email": email,
        "workspace": ws_name,
        "workspace_name": ws_name,
        "tenant": tenant_slug,
        "tenant_slug": tenant_slug,
        "page": page_title,
        "page_title": page_title,
    }


async def _resolve_template_payload_rendered(
    db,
    template_id: str,
    lang: str,
    variables: Optional[dict[str, str]],
) -> tuple[str, Any, Optional[str]]:
    title, content, icon = await _resolve_template_payload(db, template_id, lang)
    if not variables:
        return title, content, icon
    return (
        _render_template_value(title, variables),
        _render_template_value(content, variables),
        icon,
    )


def _append_template_to_content(current_content: Any, template_title: str, template_content: Any) -> Any:
    # Block-editor pages store content as block arrays; append template as section blocks.
    if isinstance(current_content, list):
        next_content = list(current_content)
        if next_content:
            next_content.append({"type": "divider", "content": []})
        next_content.append({"type": "heading_2", "content": [{"type": "text", "text": template_title}]})
        if isinstance(template_content, dict) and isinstance(template_content.get("text"), str):
            text_val = template_content.get("text") or ""
            for line in text_val.split("\n"):
                next_content.append({"type": "paragraph", "content": [{"type": "text", "text": line}]})
        else:
            next_content.append({
                "type": "paragraph",
                "content": [{"type": "text", "text": f"[Template inserted: {template_title}]"}],
            })
        return next_content

    # Markdown-like pages store simple {"text": "..."} payload.
    if isinstance(current_content, dict) and "text" in current_content:
        current_text = current_content.get("text") or ""
        if isinstance(template_content, dict) and isinstance(template_content.get("text"), str):
            merged = f"{current_text}\n\n---\n\n## {template_title}\n\n{template_content.get('text') or ''}".strip()
        else:
            merged = f"{current_text}\n\n---\n\n## {template_title}\n\n(Template inserted)".strip()
        next_dict = dict(current_content)
        next_dict["text"] = merged
        return next_dict

    # For structured pages (_views/task_tracker/voice_memo), keep them safe and explicit.
    raise HTTPException(status_code=400, detail="Append mode only supports text or block-editor pages")


async def _apply_template_payload_to_page(
    db,
    *,
    page_id: str,
    template_title: str,
    template_content: Any,
    template_icon: Optional[str],
    mode: str,
) -> None:
    page_result = await db.execute(
        text("SELECT content FROM pages WHERE id = :id AND is_archived = FALSE"),
        {"id": page_id},
    )
    page_row = page_result.fetchone()
    if not page_row:
        raise HTTPException(status_code=404, detail="Page not found")

    if mode == "replace":
        next_content = template_content
        update_sql = text("UPDATE pages SET title = :title, content = CAST(:content AS JSONB), icon = :icon WHERE id = :id")
        params = {"id": page_id, "title": template_title, "icon": template_icon}
    else:
        next_content = _append_template_to_content(page_row.content, template_title, template_content)
        update_sql = text("UPDATE pages SET content = CAST(:content AS JSONB) WHERE id = :id")
        params = {"id": page_id}

    params["content"] = json.dumps(next_content) if isinstance(next_content, (dict, list)) else (next_content or "{}")
    await db.execute(update_sql, params)


async def _ensure_template_buttons_table(db) -> None:
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS page_template_buttons (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            page_id UUID NOT NULL,
            label VARCHAR(120) NOT NULL,
            template_id VARCHAR(255) NOT NULL,
            apply_mode VARCHAR(20) NOT NULL DEFAULT 'append',
            position INTEGER NOT NULL DEFAULT 0,
            created_by UUID,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """))
    await db.execute(text("CREATE INDEX IF NOT EXISTS idx_page_template_buttons_page ON page_template_buttons(page_id, position)"))

@router.post("/pages/{page_id}/use-template-overwrite")
async def use_template_overwrite(page_id: str, body: OverwriteWithTemplate, ctx: dict = Depends(get_current_user_with_tenant)):
    """Apply template content to an existing page (Notion-style onboarding)."""
    db = ctx["db"]
    variables = await _build_template_variables(db, ctx, page_id=page_id)
    title, content, icon = await _resolve_template_payload_rendered(db, body.template_id, body.lang, variables)

    content_json = json.dumps(content) if isinstance(content, (dict, list)) else (content or "{}")
    await db.execute(
        text("UPDATE pages SET title = :title, content = CAST(:content AS JSONB), icon = :icon WHERE id = :id"),
        {"title": title, "content": content_json, "icon": icon, "id": page_id}
    )
    await db.commit()
    return {"status": "overwritten"}

@router.post("/pages/{page_id}/copy-to")
async def copy_page_to_workspace(page_id: str, body: CopyPageBody,
                                  ctx: dict = Depends(get_current_user_with_tenant)):
    """Copy a page (with its content) into a different workspace.
    Original page stays intact. Returns the newly created page."""
    db = ctx["db"]
    # Fetch source page
    result = await db.execute(
        text("SELECT title, content, icon, cover_emoji FROM pages WHERE id = :id AND is_archived = FALSE"),
        {"id": page_id}
    )
    src = result.fetchone()
    if not src:
        raise HTTPException(status_code=404, detail="Source page not found")

    new_id = str(uuid.uuid4())
    title = body.title or src.title
    content_json = json.dumps(src.content) if isinstance(src.content, dict) else (src.content or "{}")
    await db.execute(
        text("""INSERT INTO pages (id, workspace_id, title, content, icon, cover_emoji, created_by)
                VALUES (:id, :wsid, :title, CAST(:content AS JSONB), :icon, :cover, :creator)"""),
        {"id": new_id, "wsid": body.target_workspace_id, "title": title,
         "content": content_json, "icon": src.icon, "cover": src.cover_emoji, "creator": ctx["sub"]}
    )
    await db.commit()
    return {"id": new_id, "title": title, "workspace_id": body.target_workspace_id}


# ── Workspace member (sharing) endpoints ───────────────────────────────────────

@router.get("/workspaces/{workspace_id}/members")
async def list_workspace_members(workspace_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """List members of a workspace (employees + their role)."""
    result = await ctx["db"].execute(
        text("""SELECT wm.user_id, wm.role, wm.created_at,
                       u.full_name, u.email
                FROM workspace_members wm
                LEFT JOIN users u ON u.id = wm.user_id
                WHERE wm.workspace_id = :wsid
                ORDER BY wm.created_at ASC"""),
        {"wsid": workspace_id}
    )
    rows = [dict(row._mapping) for row in result.fetchall()]
    # Enrich with employee title if available
    for row in rows:
        row["title"] = row.get("full_name", "")  # fallback; HR employees have title via separate query
    return rows


@router.post("/workspaces/{workspace_id}/members")
async def add_workspace_member(workspace_id: str, body: WorkspaceMemberAdd,
                                ctx: dict = Depends(get_current_user_with_tenant)):
    """Add a member to a workspace by user_id or email."""
    db = ctx["db"]
    user_id = body.user_id

    if not user_id and body.email:
        result = await db.execute(
            text("SELECT id FROM users WHERE email = :email"), {"email": body.email}
        )
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        user_id = str(row.id)

    if not user_id:
        raise HTTPException(status_code=400, detail="Provide user_id or email")

    await db.execute(
        text("""INSERT INTO workspace_members (workspace_id, user_id, role, added_by)
                VALUES (:wsid, :uid, :role, :added_by)
                ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role"""),
        {"wsid": workspace_id, "uid": user_id, "role": body.role, "added_by": ctx["sub"]}
    )
    await db.commit()
    return {"status": "added", "user_id": user_id, "role": body.role}


@router.delete("/workspaces/{workspace_id}/members/{user_id}")
async def remove_workspace_member(workspace_id: str, user_id: str,
                                   ctx: dict = Depends(get_current_user_with_tenant)):
    await ctx["db"].execute(
        text("DELETE FROM workspace_members WHERE workspace_id = :wsid AND user_id = :uid"),
        {"wsid": workspace_id, "uid": user_id}
    )
    await ctx["db"].commit()
    return {"status": "removed"}


# ── Template endpoints ─────────────────────────────────────────────────────────

@router.get("/templates")
async def list_templates(lang: str = "en", ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(
        text("""SELECT p.id, p.title, p.icon, p.template_category as category,
                       COALESCE(p.template_description, '') as description,
                       p.content, p.created_at, u.full_name as creator_name
                FROM pages p
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.is_template = TRUE AND p.is_archived = FALSE
                ORDER BY p.created_at DESC""")
    )
    user_templates = [
        {**dict(row._mapping), "source": "user"}
        for row in result.fetchall()
    ]
    builtin = [{**t, "source": "builtin"} for t in get_builtin_templates(lang)]
    return builtin + user_templates


@router.post("/pages/{page_id}/save-as-template")
async def save_as_template(page_id: str, body: SaveAsTemplateBody,
                            ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    if body.mode not in ("clone", "convert"):
        raise HTTPException(status_code=400, detail="mode must be clone or convert")

    if body.mode == "convert":
        params: dict = {"id": page_id, "cat": body.category, "descr": body.description}
        sql = "UPDATE pages SET is_template = TRUE, template_category = :cat, template_description = :descr"
        if body.title:
            sql += ", title = :title"
            params["title"] = body.title
        sql += " WHERE id = :id"
        await db.execute(text(sql), params)
        await db.commit()
        return {"status": "saved", "mode": "convert", "template_id": page_id}

    src_result = await db.execute(
        text("""SELECT workspace_id, content, icon, cover_emoji, title
                FROM pages
                WHERE id = :id AND is_archived = FALSE"""),
        {"id": page_id}
    )
    src = src_result.fetchone()
    if not src:
        raise HTTPException(status_code=404, detail="Source page not found")

    new_template_id = str(uuid.uuid4())
    new_title = body.title or src.title
    content_json = json.dumps(src.content) if isinstance(src.content, (dict, list)) else (src.content or "{}")
    await db.execute(
        text("""INSERT INTO pages (
                    id, workspace_id, parent_page_id, title, content, icon, cover_emoji,
                    is_template, template_category, template_description, created_by
                ) VALUES (
                    :id, :wsid, NULL, :title, CAST(:content AS JSONB), :icon, :cover,
                    TRUE, :cat, :descr, :creator
                )"""),
        {
            "id": new_template_id,
            "wsid": src.workspace_id,
            "title": new_title,
            "content": content_json,
            "icon": src.icon,
            "cover": src.cover_emoji,
            "cat": body.category,
            "descr": body.description,
            "creator": ctx["sub"],
        }
    )
    await db.commit()
    return {"status": "saved", "mode": "clone", "template_id": new_template_id}


@router.post("/pages/{page_id}/apply-template")
async def apply_template_to_page(page_id: str, body: TemplateApplyBody,
                                 ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    if body.mode not in ("replace", "append"):
        raise HTTPException(status_code=400, detail="mode must be replace or append")

    variables = await _build_template_variables(db, ctx, page_id=page_id)
    tpl_title, tpl_content, tpl_icon = await _resolve_template_payload_rendered(db, body.template_id, body.lang, variables)
    await _apply_template_payload_to_page(
        db,
        page_id=page_id,
        template_title=tpl_title,
        template_content=tpl_content,
        template_icon=tpl_icon,
        mode=body.mode,
    )
    await db.commit()
    return {"status": "applied", "mode": body.mode}


@router.get("/pages/{page_id}/template-buttons")
async def list_page_template_buttons(page_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await _ensure_template_buttons_table(db)
    result = await db.execute(
        text("""SELECT id, page_id, label, template_id, apply_mode, position, created_at
                FROM page_template_buttons
                WHERE page_id = :pid
                ORDER BY position ASC, created_at ASC"""),
        {"pid": page_id},
    )
    return [dict(r._mapping) for r in result.fetchall()]


@router.post("/pages/{page_id}/template-buttons")
async def create_page_template_button(page_id: str, body: TemplateButtonCreate,
                                      ctx: dict = Depends(get_current_user_with_tenant)):
    if body.apply_mode not in ("append", "replace"):
        raise HTTPException(status_code=400, detail="apply_mode must be append or replace")
    db = ctx["db"]
    await _ensure_template_buttons_table(db)
    # Validate template exists.
    await _resolve_template_payload(db, body.template_id, "en")

    pos_result = await db.execute(
        text("SELECT COALESCE(MAX(position), -1) as pos FROM page_template_buttons WHERE page_id = :pid"),
        {"pid": page_id},
    )
    row = pos_result.fetchone()
    next_pos = int((row.pos if row else -1) or -1) + 1
    label = (body.label or "Template").strip()[:120] or "Template"
    button_id = str(uuid.uuid4())
    await db.execute(
        text("""INSERT INTO page_template_buttons (id, page_id, label, template_id, apply_mode, position, created_by)
                VALUES (:id, :pid, :label, :tpl, :mode, :pos, :uid)"""),
        {"id": button_id, "pid": page_id, "label": label, "tpl": body.template_id, "mode": body.apply_mode, "pos": next_pos, "uid": ctx["sub"]},
    )
    await db.commit()
    return {"id": button_id, "label": label, "template_id": body.template_id, "apply_mode": body.apply_mode, "position": next_pos}


@router.delete("/pages/{page_id}/template-buttons/{button_id}")
async def delete_page_template_button(page_id: str, button_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await _ensure_template_buttons_table(db)
    await db.execute(
        text("DELETE FROM page_template_buttons WHERE id = :id AND page_id = :pid"),
        {"id": button_id, "pid": page_id},
    )
    await db.commit()
    return {"status": "deleted"}


@router.patch("/pages/{page_id}/template-buttons/reorder")
async def reorder_page_template_buttons(page_id: str, body: TemplateButtonReorderBody,
                                        ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await _ensure_template_buttons_table(db)
    ordered_ids = [str(i) for i in body.ordered_ids if i]
    if not ordered_ids:
        raise HTTPException(status_code=400, detail="ordered_ids is required")
    existing_result = await db.execute(
        text("SELECT id FROM page_template_buttons WHERE page_id = :pid"),
        {"pid": page_id},
    )
    existing_ids = {str(r.id) for r in existing_result.fetchall()}
    if set(ordered_ids) != existing_ids:
        raise HTTPException(status_code=400, detail="ordered_ids must include all existing button ids exactly once")

    for idx, button_id in enumerate(ordered_ids):
        await db.execute(
            text("UPDATE page_template_buttons SET position = :pos WHERE id = :id AND page_id = :pid"),
            {"pos": idx, "id": button_id, "pid": page_id},
        )
    await db.commit()
    return {"status": "reordered"}


@router.patch("/pages/{page_id}/template-buttons/{button_id}")
async def update_page_template_button(page_id: str, button_id: str, body: TemplateButtonUpdateBody,
                                      ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await _ensure_template_buttons_table(db)

    updates: dict[str, Any] = {}
    if body.label is not None:
        label = body.label.strip()[:120]
        if not label:
            raise HTTPException(status_code=400, detail="label cannot be empty")
        updates["label"] = label
    if body.apply_mode is not None:
        if body.apply_mode not in ("append", "replace"):
            raise HTTPException(status_code=400, detail="apply_mode must be append or replace")
        updates["apply_mode"] = body.apply_mode
    if not updates:
        raise HTTPException(status_code=400, detail="No update fields provided")

    set_clause, params = build_update_clause(updates, prefix="u_")
    params.update({"id": button_id, "pid": page_id})
    result = await db.execute(
        text(f"""UPDATE page_template_buttons
                 SET {set_clause}
                 WHERE id = :id AND page_id = :pid
                 RETURNING id, page_id, label, template_id, apply_mode, position, created_at"""),
        params,
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Template button not found")
    await db.commit()
    return dict(row._mapping)


@router.post("/pages/{page_id}/template-buttons/{button_id}/run")
async def run_page_template_button(page_id: str, button_id: str, body: TemplateButtonRunBody,
                                   ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await _ensure_template_buttons_table(db)
    result = await db.execute(
        text("""SELECT template_id, apply_mode
                FROM page_template_buttons
                WHERE id = :id AND page_id = :pid"""),
        {"id": button_id, "pid": page_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Template button not found")
    mode = row.apply_mode if row.apply_mode in ("append", "replace") else "append"
    variables = await _build_template_variables(db, ctx, page_id=page_id)
    tpl_title, tpl_content, tpl_icon = await _resolve_template_payload_rendered(db, row.template_id, body.lang, variables)
    await _apply_template_payload_to_page(
        db,
        page_id=page_id,
        template_title=tpl_title,
        template_content=tpl_content,
        template_icon=tpl_icon,
        mode=mode,
    )
    await db.commit()
    return {"status": "applied", "mode": mode}


# ── Global search ─────────────────────────────────────────────────────────────

@router.get("/search")
async def search_pages(q: str = "", ctx: dict = Depends(get_current_user_with_tenant)):
    """Cross-workspace global search on page titles and content."""
    if not q or len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query too short (min 2 characters)")
    db = ctx["db"]
    user_id = ctx["sub"]
    results = await db.execute(
        text("""
            SELECT p.id, p.title, p.icon, p.workspace_id, w.name as workspace_name
            FROM pages p
            JOIN workspaces w ON w.id = p.workspace_id
            LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = :uid
            WHERE p.is_archived = FALSE
              AND (p.is_template IS NULL OR p.is_template = FALSE)
              AND (w.owner_id = :uid OR w.visibility = 'team' OR wm.user_id IS NOT NULL)
              AND (p.title ILIKE :q OR CAST(p.content AS TEXT) ILIKE :q)
            ORDER BY p.updated_at DESC
            LIMIT 20
        """),
        {"uid": user_id, "q": f"%{q.strip()}%"}
    )
    return [dict(r._mapping) for r in results.fetchall()]


# ── Page favorites ────────────────────────────────────────────────────────────

@router.post("/pages/{page_id}/favorite")
async def toggle_favorite(page_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Toggle favorite status for a page."""
    db = ctx["db"]
    user_id = ctx["sub"]
    # Check if already favorited
    existing = await db.execute(
        text("SELECT 1 FROM page_favorites WHERE user_id = :uid AND page_id = :pid"),
        {"uid": user_id, "pid": page_id}
    )
    if existing.fetchone():
        await db.execute(
            text("DELETE FROM page_favorites WHERE user_id = :uid AND page_id = :pid"),
            {"uid": user_id, "pid": page_id}
        )
        await db.commit()
        return {"status": "unfavorited"}
    else:
        await db.execute(
            text("INSERT INTO page_favorites (user_id, page_id) VALUES (:uid, :pid)"),
            {"uid": user_id, "pid": page_id}
        )
        await db.commit()
        return {"status": "favorited"}


@router.get("/favorites")
async def list_favorites(ctx: dict = Depends(get_current_user_with_tenant)):
    """Return all favorited pages for the current user."""
    db = ctx["db"]
    user_id = ctx["sub"]
    results = await db.execute(
        text("""
            SELECT p.id, p.title, p.icon, p.workspace_id, w.name as workspace_name, f.created_at as favorited_at
            FROM page_favorites f
            JOIN pages p ON p.id = f.page_id
            JOIN workspaces w ON w.id = p.workspace_id
            WHERE f.user_id = :uid AND p.is_archived = FALSE
            ORDER BY f.created_at DESC
        """),
        {"uid": user_id}
    )
    return [dict(r._mapping) for r in results.fetchall()]


# ── Page export ───────────────────────────────────────────────────────────────

from fastapi.responses import PlainTextResponse

@router.get("/pages/{page_id}/export")
async def export_page(page_id: str, format: str = "md", ctx: dict = Depends(get_current_user_with_tenant)):
    """Export a page as Markdown."""
    db = ctx["db"]
    result = await db.execute(
        text("SELECT title, content, icon FROM pages WHERE id = :id AND is_archived = FALSE"),
        {"id": page_id}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Page not found")

    title = row.title or "Untitled"
    content = row.content or {}
    if isinstance(content, str):
        content = json.loads(content)

    lines = [f"# {row.icon + ' ' if row.icon else ''}{title}\n"]

    def _views_to_md(views):
        parts = []
        for v in views:
            vtype = v.get("type", "")
            vtitle = v.get("title", "")
            parts.append(f"\n## {v.get('icon', '')} {vtitle}\n")
            if vtype == "document":
                parts.append(v.get("data", {}).get("text", ""))
            elif vtype == "table":
                cols = v.get("columns", [])
                rows = v.get("rows", [])
                if cols:
                    header = "| " + " | ".join(c.get("title", c.get("key", "")) for c in cols) + " |"
                    sep = "| " + " | ".join("---" for _ in cols) + " |"
                    parts.append(header)
                    parts.append(sep)
                    for r in rows:
                        vals = "| " + " | ".join(str(r.get(c.get("key", ""), "")) for c in cols) + " |"
                        parts.append(vals)
            elif vtype == "task_tracker":
                tasks = v.get("data", {}).get("_tasks", [])
                for t in tasks:
                    check = "x" if t.get("status") == "done" else " "
                    priority = f" [{t['priority']}]" if t.get("priority") else ""
                    parts.append(f"- [{check}] {t.get('title', '')}{priority}")
            elif vtype == "database":
                db_data = v.get("dbData", {})
                schema = db_data.get("schema", {})
                cols = schema.get("columns", [])
                rows = db_data.get("rows", [])
                if cols:
                    header = "| " + " | ".join(c.get("title", c.get("key", "")) for c in cols) + " |"
                    sep = "| " + " | ".join("---" for _ in cols) + " |"
                    parts.append(header)
                    parts.append(sep)
                    for r in rows:
                        vals = "| " + " | ".join(str(r.get(c.get("key", ""), "")) for c in cols) + " |"
                        parts.append(vals)
        return "\n".join(parts)

    # Multi-view page
    if "_views" in content:
        lines.append(_views_to_md(content["_views"]))
    # Task tracker page
    elif content.get("_type") == "task_tracker":
        tasks = content.get("_tasks", [])
        for t in tasks:
            check = "x" if t.get("status") == "done" else " "
            priority = f" [{t['priority']}]" if t.get("priority") else ""
            lines.append(f"- [{check}] {t.get('title', '')}{priority}")
    # Simple document page
    elif "text" in content:
        lines.append(content["text"])
    else:
        lines.append(json.dumps(content, ensure_ascii=False, indent=2))

    md = "\n".join(lines)
    return PlainTextResponse(content=md, media_type="text/markdown",
                              headers={"Content-Disposition": f'attachment; filename="{title}.md"'})


# ── AI text-action endpoint ─────────────────────────────────────────────────

class AIActionRequest(BaseModel):
    action: str          # summarize | fix_grammar | shorter | longer | translate | extract_actions | rewrite | change_tone | continue_writing | generate
    text: Optional[str] = None     # selected text for text-level actions
    page_content: Optional[Any] = None  # full page blocks for page-level actions
    target_language: Optional[str] = None  # for translate
    tone: Optional[str] = None     # professional | casual | friendly | confident | direct
    prompt: Optional[str] = None   # for generate action

ACTION_PROMPTS: dict = {
    "summarize": "Summarize the following text in 2-4 concise sentences, preserving the key points:\n\n{text}",
    "fix_grammar": "Fix any spelling, grammar, and punctuation errors in the following text. Return only the corrected text, no explanations:\n\n{text}",
    "shorter": "Rewrite the following text to be more concise and shorter while preserving all key meaning. Return only the rewritten text:\n\n{text}",
    "longer": "Expand and elaborate on the following text, adding more detail, examples, and depth. Return only the expanded text:\n\n{text}",
    "translate": "Translate the following text to {target_language}. Return only the translated text:\n\n{text}",
    "extract_actions": """Extract all action items and tasks from the following text. Format as a JSON array of objects with keys: "task", "owner" (if mentioned, else ""), "due_date" (if mentioned, else ""), "priority" (High/Medium/Low based on context).

Text:
{text}

Return ONLY a JSON array, no markdown fences.""",
    "rewrite": "Improve the writing quality of the following text. Make it clearer, more professional, and better structured. Return only the rewritten text:\n\n{text}",
    "change_tone": "Rewrite the following text with a {tone} tone. Return only the rewritten text:\n\n{text}",
    "continue_writing": "Continue writing naturally from where the following text ends. Add 2-4 more sentences or a paragraph that flows smoothly. Return only the continuation:\n\n{text}",
    "generate": "{prompt}",
    "explain": "Explain the following text in simple, clear terms that anyone can understand:\n\n{text}",
    "find_todos": """Find all TODO items, open questions, and incomplete tasks in the following text. Return as JSON array with keys: "item", "context", "type" (TODO/Question/Follow-up).

Text:
{text}

Return ONLY a JSON array.""",
    "plan_subtasks": """{prompt}""",
}

@router.post("/pages/{page_id}/ai-action")
async def ai_action(page_id: str, body: AIActionRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    """Notion-style AI text actions: summarize, fix grammar, translate, etc."""
    from app.services.ai.provider import generate_text_for_tenant, generate_json_for_tenant
    db = ctx["db"]

    # Use tenant_id (UUID) so _resolve_config hits tenant_ai_configs table;
    # fall back to tenant_slug for legacy slug-based lookup.
    tenant_ref: str | None = ctx.get("tenant_id") or ctx.get("tenant_slug")

    action = body.action
    text_input = body.text or ""

    # For page-level summarize without selected text, convert page blocks to plain text
    if action == "summarize" and body.page_content and not text_input:
        def _extract_text(blocks: list) -> list[str]:
            parts: list[str] = []
            for b in (blocks or []):
                if not isinstance(b, dict):
                    continue
                ct = b.get("content", "")
                if isinstance(ct, list):
                    parts.extend(c.get("text", "") for c in ct if isinstance(c, dict))
                elif isinstance(ct, str):
                    parts.append(ct)
                parts.extend(_extract_text(b.get("children", [])))
            return parts
        text_input = "\n".join(_extract_text(body.page_content)).strip()

    template = ACTION_PROMPTS.get(action, ACTION_PROMPTS["rewrite"])
    prompt = template.format(
        text=text_input or "(no text provided)",
        target_language=body.target_language or "English",
        tone=body.tone or "professional",
        prompt=body.prompt or text_input or "Help with this page.",
    )

    system = (
        "You are a professional writing assistant integrated into a Notion-like workspace. "
        "Follow instructions precisely. Be concise and return only what was asked."
    )

    # JSON-response actions
    if action in ("extract_actions", "find_todos", "plan_subtasks"):
        try:
            result = await generate_json_for_tenant(db, tenant_ref, prompt, system_instruction=system)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI action failed: {e}")
        return {"action": action, "result": result, "type": "json"}

    # Text-response actions
    try:
        result_text = await generate_text_for_tenant(db, tenant_ref, prompt, system_instruction=system)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI action failed: {e}")

    return {"action": action, "result": result_text.strip(), "type": "text"}


@router.delete("/templates/{page_id}")
async def delete_template(page_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Soft-delete a user's own template (marks is_template=FALSE and archives it)."""
    await ctx["db"].execute(
        text("UPDATE pages SET is_template = FALSE, is_archived = TRUE WHERE id = :id AND created_by = :uid"),
        {"id": page_id, "uid": ctx["sub"]}
    )
    await ctx["db"].commit()
    return {"status": "deleted"}


@router.post("/templates/{template_id}/use")
async def use_template(template_id: str, body: PageFromTemplate,
                       ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    page_id = str(uuid.uuid4())
    variables = await _build_template_variables(db, ctx, workspace_id=body.workspace_id)
    src_title, content, icon = await _resolve_template_payload_rendered(db, template_id, "zh", variables)
    title = body.title or src_title

    # Serialize content to JSON string — asyncpg requires explicit CAST for JSONB with text() queries
    content_json = json.dumps(content) if isinstance(content, dict) else (content or "{}")
    await db.execute(
        text("""INSERT INTO pages (id, workspace_id, parent_page_id, title, content, icon, created_by)
                VALUES (:id, :wsid, :parent, :title, CAST(:content AS JSONB), :icon, :creator)"""),
        {"id": page_id, "wsid": body.workspace_id, "parent": body.parent_page_id,
         "title": title, "content": content_json, "icon": icon, "creator": ctx["sub"]}
    )
    await db.commit()
    return {"id": page_id, "title": title, "workspace_id": body.workspace_id}


# ── Page Sharing Endpoints ────────────────────────────────────────────────────

@router.get("/pages/{page_id}/sharing")
async def get_page_sharing(page_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Return the page's _permissions config (stored in content JSONB) plus workspace members."""
    db = ctx["db"]

    # Fetch page content
    result = await db.execute(
        text("SELECT content, workspace_id FROM pages WHERE id = :id AND is_archived = FALSE"),
        {"id": page_id}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Page not found")

    content = row.content or {}
    permissions = content.get("_permissions", {"default_permission": "view", "overrides": {}})

    # Fetch workspace members if workspace_id available
    workspace_id = row.workspace_id
    members = []
    if workspace_id:
        mem_result = await db.execute(
            text("""
                SELECT u.id, u.email, u.full_name, u.avatar_url, u.role
                FROM workspace_members wm
                JOIN users u ON u.id = wm.user_id
                WHERE wm.workspace_id = :wsid
            """),
            {"wsid": str(workspace_id)}
        )
        for m in mem_result.fetchall():
            members.append({
                "id": str(m.id),
                "email": m.email,
                "full_name": m.full_name or "",
                "avatar_url": m.avatar_url,
                "role": m.role,
            })

    return {"permissions": permissions, "members": members}


@router.patch("/pages/{page_id}/sharing")
async def update_page_sharing(
    page_id: str,
    body: dict,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Write _permissions into page content JSONB."""
    db = ctx["db"]

    # Fetch current content
    result = await db.execute(
        text("SELECT content FROM pages WHERE id = :id AND is_archived = FALSE"),
        {"id": page_id}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Page not found")

    content = row.content or {}
    if isinstance(content, str):
        import json as _json
        content = _json.loads(content)

    # Merge in the new permissions
    new_permissions = body.get("permissions", {})
    content["_permissions"] = new_permissions

    content_json = json.dumps(content)
    await db.execute(
        text("UPDATE pages SET content = CAST(:content AS JSONB), updated_at = NOW() WHERE id = :id"),
        {"content": content_json, "id": page_id}
    )
    await db.commit()
    return {"status": "ok", "permissions": new_permissions}


# ── Page Comments ─────────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    block_id: Optional[str] = None
    selected_text: str
    comment_text: str


class CommentUpdate(BaseModel):
    comment_text: Optional[str] = None
    resolved: Optional[bool] = None


@router.post("/pages/{page_id}/comments")
async def create_comment(page_id: str, body: CommentCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    comment_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO page_comments (id, page_id, block_id, selected_text, comment_text, created_by)
            VALUES (:id, :page_id, :block_id, :selected_text, :comment_text, :created_by)
        """),
        {
            "id": comment_id,
            "page_id": page_id,
            "block_id": body.block_id,
            "selected_text": body.selected_text,
            "comment_text": body.comment_text,
            "created_by": ctx.get("sub"),
        },
    )
    await db.commit()
    return {"id": comment_id, "status": "created"}


@router.get("/pages/{page_id}/comments")
async def list_comments(page_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(
        text("""
            SELECT c.id, c.block_id, c.selected_text, c.comment_text, c.resolved,
                   c.created_by, c.created_at, c.updated_at,
                   u.full_name AS author_name, u.avatar_url AS author_avatar
            FROM page_comments c
            LEFT JOIN users u ON u.id = c.created_by
            WHERE c.page_id = :page_id
            ORDER BY c.created_at DESC
        """),
        {"page_id": page_id},
    )
    rows = result.fetchall()
    return {
        "comments": [
            {
                "id": str(r.id),
                "block_id": r.block_id,
                "selected_text": r.selected_text,
                "comment_text": r.comment_text,
                "resolved": r.resolved,
                "created_by": str(r.created_by) if r.created_by else None,
                "author_name": r.author_name,
                "author_avatar": r.author_avatar,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]
    }


@router.patch("/pages/{page_id}/comments/{comment_id}")
async def update_comment(page_id: str, comment_id: str, body: CommentUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    sets = []
    params: dict = {"id": comment_id, "page_id": page_id}
    if body.comment_text is not None:
        sets.append("comment_text = :comment_text")
        params["comment_text"] = body.comment_text
    if body.resolved is not None:
        sets.append("resolved = :resolved")
        params["resolved"] = body.resolved
    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")
    sets.append("updated_at = NOW()")
    sql = f"UPDATE page_comments SET {', '.join(sets)} WHERE id = :id AND page_id = :page_id"
    await db.execute(text(sql), params)
    await db.commit()
    return {"status": "updated"}
