"""CRM module Pydantic schemas."""

from pydantic import BaseModel
from typing import Optional
from datetime import date


class LeadCreate(BaseModel):
    full_name: str
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    wechat: Optional[str] = None
    status: str = "inquiry"
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    familiarity_stage: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[list] = None
    extra: Optional[dict] = None


class LeadUpdate(BaseModel):
    full_name: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    wechat: Optional[str] = None
    status: Optional[str] = None
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    familiarity_stage: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[list] = None
    extra: Optional[dict] = None


class CustomerCreate(BaseModel):
    name: str
    industry: Optional[str] = None
    country: Optional[str] = None
    credit_level: Optional[str] = None
    status: str = "active"
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    credit_level: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class ContractCreate(BaseModel):
    contract_no: str
    title: str
    lead_id: Optional[str] = None
    amount: float = 0
    currency: str = "CNY"
    status: str = "draft"
    risk_level: str = "low"
    sign_date: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None


class ContractUpdate(BaseModel):
    contract_no: Optional[str] = None
    title: Optional[str] = None
    lead_id: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    risk_level: Optional[str] = None
    sign_date: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None


class ReceivableCreate(BaseModel):
    contract_id: str
    amount: float
    currency: str = "CNY"
    due_date: Optional[str] = None
    description: Optional[str] = None
    status: str = "pending"


class ReceivableUpdate(BaseModel):
    amount: Optional[float] = None
    due_date: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
