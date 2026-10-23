/**
 * email
 *
 * The critical-approval email. Status tones stay in the template; the words,
 * including the per-status subject line, are here.
 */

const en = {
  "email.approval.preheader": "Your DSHX Hub approval has been updated.",
  "email.approval.request": "Item",
  "email.approval.status": "Status",
  "email.approval.execution": "Progress",
  "email.approval.approvalId": "Reference",
  "email.approval.reason": "Note",
  "email.approval.open": "View details",
  "email.approval.footer":
    "You received this email because this approval is linked to your DSHX Hub account. This address does not accept replies.",
  "email.approval.executionValue.succeeded": "Completed",
  "email.approval.executionValue.awaitingAgent": "Waiting to be processed",
  "email.approval.executionValue.failed": "Failed",
  "email.approval.executionValue.other": "Not processed",
  "email.approval.approved.subject": "Approved: {title}",
  "email.approval.approved.label": "Approved",
  "email.approval.approved.heading": "Approval passed",
  "email.approval.approved.descriptionAgent":
    "The request was approved and is waiting to be processed.",
  "email.approval.approved.descriptionDone": "The requested change has been completed.",
  "email.approval.rejected.subject": "Not approved: {title}",
  "email.approval.rejected.label": "Rejected",
  "email.approval.rejected.heading": "Approval not passed",
  "email.approval.rejected.description": "No changes were made. You can view the reason below.",
  "email.approval.changesRequested.subject": "More information needed: {title}",
  "email.approval.changesRequested.label": "More information needed",
  "email.approval.changesRequested.heading": "Please add more information",
  "email.approval.changesRequested.description":
    "Update the request based on the note below, then submit it again.",
  "email.approval.effectFailed.subject": "Could not complete: {title}",
  "email.approval.effectFailed.label": "Could not complete",
  "email.approval.effectFailed.heading": "The approved change could not be completed",
  "email.approval.effectFailed.description":
    "No retry has started. An administrator can review the issue and try again.",
} as const;

const zh: Record<keyof typeof en, string> = {
  "email.approval.preheader": "你的 DSHX Hub 审批有新进展。",
  "email.approval.request": "事项",
  "email.approval.status": "当前状态",
  "email.approval.execution": "处理进度",
  "email.approval.approvalId": "记录编号",
  "email.approval.reason": "说明",
  "email.approval.open": "查看详情",
  "email.approval.footer":
    "这项审批与你的 DSHX Hub 账号有关，因此你收到了这封邮件。本邮箱不接收回复。",
  "email.approval.executionValue.succeeded": "已完成",
  "email.approval.executionValue.awaitingAgent": "等待处理",
  "email.approval.executionValue.failed": "执行失败",
  "email.approval.executionValue.other": "尚未处理",
  "email.approval.approved.subject": "审批通过：{title}",
  "email.approval.approved.label": "审批通过",
  "email.approval.approved.heading": "审批已通过",
  "email.approval.approved.descriptionAgent": "申请已经通过，目前正在等待处理。",
  "email.approval.approved.descriptionDone": "申请的变更已经完成。",
  "email.approval.rejected.subject": "审批未通过：{title}",
  "email.approval.rejected.label": "未通过",
  "email.approval.rejected.heading": "审批未通过",
  "email.approval.rejected.description": "本次没有产生变更，你可以在下方查看原因。",
  "email.approval.changesRequested.subject": "需要补充信息：{title}",
  "email.approval.changesRequested.label": "需要补充信息",
  "email.approval.changesRequested.heading": "请补充相关信息",
  "email.approval.changesRequested.description": "请根据下方说明更新申请，然后重新提交。",
  "email.approval.effectFailed.subject": "处理失败：{title}",
  "email.approval.effectFailed.label": "处理失败",
  "email.approval.effectFailed.heading": "审批后的操作没有完成",
  "email.approval.effectFailed.description": "系统还没有重试。管理员可以查看问题并重新处理。",
};

export const emailMessages = { en, zh };
