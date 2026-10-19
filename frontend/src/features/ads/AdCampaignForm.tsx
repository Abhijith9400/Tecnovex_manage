"use client";

import { Trash2 } from "@/components/ui/icons";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Alert } from "@/components/ui/Feedback";
import { FormGrid, FormSection, MoneyField, SelectField, TextAreaField, TextField } from "@/components/ui/FormFields";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api, approvalMessage, errorMessage, isApprovalRequested } from "@/lib/api";
import { toFormValues, useForm } from "@/lib/form";
import { todayInput } from "@/lib/labels";
import { enumOptions, useClientOptions } from "@/lib/options";
import type { AdCampaign } from "@/types/models";
import { CreativePicker } from "./CreativePicker";

const BOOST_TYPES = ["POST_BOOST", "REEL_BOOST", "STORY_BOOST"];

export const AD_PLATFORMS = ["META", "GOOGLE", "YOUTUBE", "LINKEDIN", "X", "OTHER"] as const;
export const AD_TYPES = ["POST_BOOST", "REEL_BOOST", "STORY_BOOST", "ADS_MANAGER_CAMPAIGN", "LEAD_GENERATION", "SEARCH_ADS", "DISPLAY_ADS", "VIDEO_ADS", "OTHER"] as const;
export const AD_STATUSES = ["PLANNED", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;

export const platformLabel: Record<string, string> = {
  META: "Meta (Facebook / Instagram)",
  GOOGLE: "Google Ads",
  YOUTUBE: "YouTube",
  LINKEDIN: "LinkedIn",
  X: "X (Twitter)",
  OTHER: "Other",
};

const defaults = {
  clientId: "",
  creativeId: "",
  name: "",
  platform: "META",
  campaignType: "POST_BOOST",
  objective: "",
  status: "ACTIVE",
  startDate: todayInput(),
  endDate: "",
  budget: "",
  spend: "0",
  paidFrom: "CLIENT_ACCOUNT",
  impressions: "0",
  reach: "0",
  clicks: "0",
  results: "0",
  resultLabel: "",
  externalId: "",
  postUrl: "",
  notes: "",
};

export function AdCampaignFormModal({
  campaign,
  clientId,
  canEdit,
  canDelete = false,
  onClose,
  onSaved,
}: {
  campaign: AdCampaign | null;
  clientId?: string;
  canEdit: boolean;
  canDelete?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const clients = useClientOptions();
  const form = useForm(toFormValues({ ...defaults, clientId: clientId ?? "" }, campaign as unknown as Record<string, unknown>));
  const isBoost = BOOST_TYPES.includes(String(form.values.campaignType));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const saved = await form.submit(() => (campaign ? api.put(`/ad-campaigns/${campaign.id}`, form.values) : api.post("/ad-campaigns", form.values)));
    if (saved) {
      notify(campaign ? "Campaign updated" : "Campaign added");
      onSaved();
    }
  }

  async function remove() {
    if (!campaign) return;
    setDeleting(true);
    try {
      const result = await api.delete(`/ad-campaigns/${campaign.id}`);
      notify(isApprovalRequested(result) ? approvalMessage(result) : "Campaign deleted");
      onSaved();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={campaign ? campaign.name : "Add ad campaign"}
      description="Record boosts and paid campaigns with spend and results copied from Meta Ads Manager, Google Ads or the platform's insights."
      onClose={onClose}
      footer={
        canEdit ? (
          <>
            {campaign && canDelete && (
              <Button variant="ghost" className="mr-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Delete
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="ad-form" loading={form.submitting}>
              Save campaign
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <form id="ad-form" onSubmit={onSubmit} className="space-y-6" noValidate>
        <fieldset disabled={!canEdit} className="space-y-6">
          {form.formError && <Alert>{form.formError}</Alert>}
          <FormSection title="Campaign">
            <FormGrid>
              {!clientId && !campaign && (
                <SelectField form={form} name="clientId" label="Client" required placeholder="Choose a client" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
              )}
              <TextField form={form} name="name" label="Campaign name" required />
              <SelectField form={form} name="platform" label="Platform" options={AD_PLATFORMS.map((p) => ({ value: p, label: platformLabel[p] }))} />
              <SelectField form={form} name="campaignType" label="Type" options={enumOptions(AD_TYPES)} />
              <SelectField form={form} name="status" label="Status" options={enumOptions(AD_STATUSES)} />
              <TextField form={form} name="objective" label="Objective" hint="e.g. Engagement, Leads, Traffic, Messages" />
              <TextField form={form} name="startDate" label="Start date" type="date" required />
              <TextField form={form} name="endDate" label="End date" type="date" />
              <TextField form={form} name="externalId" label="Platform campaign / post ID" />
            </FormGrid>
          </FormSection>
          <FormSection
            title={isBoost ? "What was boosted" : "Creative promoted (optional)"}
            description={
              isBoost
                ? "Pick the poster, reel or carousel from the Creative Shelf, or paste the post link if it isn't in the shelf. Required for boosts."
                : "Link the creative this campaign used, if any."
            }
          >
            <div className="space-y-4">
              <CreativePicker
                clientId={String(form.values.clientId)}
                value={String(form.values.creativeId)}
                onChange={(id) => form.set("creativeId", id)}
                error={form.errors.creativeId}
                disabled={!canEdit}
                preferType={form.values.campaignType === "REEL_BOOST" ? "REEL" : form.values.campaignType === "POST_BOOST" ? "POST" : null}
              />
              <TextField form={form} name="postUrl" label="Link to the boosted post / reel" type="url" placeholder="https://www.instagram.com/reel/…" />
            </div>
          </FormSection>
          <FormSection title="Spend" description="Agency-paid spend is not added to Expenses automatically; record it there too if the agency paid.">
            <FormGrid>
              <MoneyField form={form} name="budget" label="Budget" />
              <MoneyField form={form} name="spend" label="Amount spent" />
              <SelectField
                form={form}
                name="paidFrom"
                label="Paid from"
                options={[
                  { value: "CLIENT_ACCOUNT", label: "Client's ad account / card" },
                  { value: "AGENCY_PAID", label: "Agency paid (to bill client)" },
                ]}
              />
            </FormGrid>
          </FormSection>
          <FormSection title="Results">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <TextField form={form} name="impressions" label="Impressions" type="number" min="0" />
              <TextField form={form} name="reach" label="Reach" type="number" min="0" />
              <TextField form={form} name="clicks" label="Clicks" type="number" min="0" />
              <TextField form={form} name="results" label="Results" type="number" min="0" />
            </div>
            <div className="mt-4">
              <TextField form={form} name="resultLabel" label="What counts as a result" hint="e.g. Leads, Messages, Link clicks, ThruPlays, Profile visits" />
            </div>
          </FormSection>
          <TextAreaField form={form} name="notes" label="Notes" rows={3} />
        </fieldset>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete campaign?"
        message="This removes the campaign and its spend and results from reports. The deletion is recorded in the audit log."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}
