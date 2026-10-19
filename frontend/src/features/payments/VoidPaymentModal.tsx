"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { ReasonModal } from "@/components/ui/ReasonModal";
import { api, errorMessage } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import type { Payment } from "@/types/models";

export function VoidPaymentModal({ payment, onClose, onVoided }: { payment: Payment; onClose: () => void; onVoided: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  async function confirm(reason: string) {
    setBusy(true);
    try {
      await api.post(`/payments/${payment.id}/void`, { reason });
      notify(`Payment ${payment.receiptNumber} voided`);
      onVoided();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ReasonModal
      title={`Void payment ${payment.receiptNumber}?`}
      description={`${formatCurrency(payment.amount)} will be removed from the invoice's paid amount. The payment stays on record as Voided; it is never deleted.`}
      confirmLabel="Void payment"
      busy={busy}
      onClose={onClose}
      onConfirm={confirm}
    />
  );
}
