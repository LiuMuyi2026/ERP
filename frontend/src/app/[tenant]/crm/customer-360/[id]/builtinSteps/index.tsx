import { ClassifyStep, PriceInquiryStep, SoftOfferStep, FirmOfferStep } from './SalesSteps';
import { ConfirmDetailsStep, DraftContractStep, SignContractStep, SendContractStep, OrderNoteStep } from './ContractSteps';
import { ProcurementCheckStep, ConfirmSupplierStep, SignPurchaseStep, PayDepositStep } from './ProcurementSteps';
import { FreightInquiryStep, BookingStep } from './BookingSteps';
import { CostConfirmStep, PackingDetailsStep, WarehouseEntryStep, GodadBillingStep, CustomsStep } from './ShippingSteps';

export const BUILTIN_RENDERERS: Record<string, React.FC> = {
  classify: ClassifyStep,
  price_inquiry: PriceInquiryStep,
  soft_offer: SoftOfferStep,
  firm_offer: FirmOfferStep,
  confirm_details: ConfirmDetailsStep,
  draft_contract: DraftContractStep,
  sign_contract: SignContractStep,
  send_contract: SendContractStep,
  order_note: OrderNoteStep,
  procurement_check: ProcurementCheckStep,
  confirm_supplier: ConfirmSupplierStep,
  sign_purchase: SignPurchaseStep,
  pay_deposit: PayDepositStep,
  freight_inquiry: FreightInquiryStep,
  booking: BookingStep,
  cost_confirm: CostConfirmStep,
  packing_details: PackingDetailsStep,
  warehouse_entry: WarehouseEntryStep,
  godad_billing: GodadBillingStep,
  customs: CustomsStep,
};
