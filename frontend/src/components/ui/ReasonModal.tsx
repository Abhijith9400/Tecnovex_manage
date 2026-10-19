"use client";

import { useState } from "react";
import { Button } from "./Button";
import { Field, Textarea } from "./Form";
import { Modal } from "./Modal";

/** Confirmation that requires a written reason (cancel, revise, void). The reason goes to the audit log. */
export function ReasonModal({
  title,
  description,
  confirmLabel,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label="Reason" required hint="Recorded in the audit log.">
        {(props) => <Textarea {...props} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />}
      </Field>
    </Modal>
  );
}
