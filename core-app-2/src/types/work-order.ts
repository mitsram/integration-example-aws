export interface WorkOrder {
  id: string;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  requestedBy: string;
  department: string;
  dueDate: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
  approvalNote?: string;
}

export interface WorkOrderFormData {
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  requestedBy: string;
  department: string;
  dueDate: string;
}

export interface SubmitResponse {
  success: boolean;
  workOrder: WorkOrder;
  soapResponse: {
    status: string;
    message: string;
    requestId: string;
  };
}
