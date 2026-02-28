<template>
  <div class="card" :class="workOrder.status.toLowerCase()">
    <div class="card-header">
      <div class="card-title-row">
        <h3>{{ workOrder.title }}</h3>
        <span :class="['priority-badge', workOrder.priority.toLowerCase()]">
          {{ workOrder.priority }}
        </span>
      </div>
      <span :class="['status-badge', workOrder.status.toLowerCase()]">
        {{ statusLabel }}
      </span>
    </div>

    <p class="description">{{ workOrder.description }}</p>

    <div class="meta-row">
      <span>👤 {{ workOrder.requestedBy }}</span>
      <span>🏢 {{ workOrder.department }}</span>
      <span>📅 Due: {{ workOrder.dueDate }}</span>
      <span>🆔 {{ workOrder.id }}</span>
    </div>

    <div v-if="workOrder.approvalNote" class="approval-note">
      💬 {{ workOrder.approvalNote }}
    </div>

    <!-- Action buttons for pending work orders -->
    <div v-if="workOrder.status === 'SUBMITTED'" class="actions">
      <div class="note-input">
        <input
          v-model="note"
          type="text"
          placeholder="Add a note (optional)..."
          class="note-field"
        />
      </div>
      <div class="action-buttons">
        <button class="btn approve" @click="$emit('approve', workOrder.id, note)">
          ✓ Approve
        </button>
        <button class="btn reject" @click="$emit('reject', workOrder.id, note)">
          ✗ Reject
        </button>
      </div>
    </div>

    <div class="card-footer">
      <span>Created: {{ formatDate(workOrder.createdAt) }}</span>
      <span v-if="workOrder.updatedAt !== workOrder.createdAt">
        Updated: {{ formatDate(workOrder.updatedAt) }}
      </span>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, type PropType } from "vue";

interface WorkOrder {
  id: string;
  title: string;
  description: string;
  priority: string;
  requestedBy: string;
  department: string;
  dueDate: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
  approvalNote?: string;
}

export default defineComponent({
  name: "WorkOrderCard",
  props: {
    workOrder: {
      type: Object as PropType<WorkOrder>,
      required: true,
    },
  },
  emits: ["approve", "reject"],
  setup(props) {
    const note = ref("");

    const statusLabel = computed(() => {
      switch (props.workOrder.status) {
        case "SUBMITTED":
          return "⏳ Pending Approval";
        case "APPROVED":
          return "✅ Approved";
        case "REJECTED":
          return "❌ Rejected";
        default:
          return props.workOrder.status;
      }
    });

    function formatDate(dateStr: string): string {
      return new Date(dateStr).toLocaleString();
    }

    return { note, statusLabel, formatDate };
  },
});
</script>

<style scoped>
.card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  border-left: 5px solid #ccc;
  transition: box-shadow 0.2s;
}

.card:hover {
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.12);
}

.card.submitted {
  border-left-color: #ffa726;
}

.card.approved {
  border-left-color: #66bb6a;
}

.card.rejected {
  border-left-color: #ef5350;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-title-row h3 {
  font-size: 16px;
  color: #333;
}

.priority-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.priority-badge.critical {
  background: #ffebee;
  color: #c62828;
}

.priority-badge.high {
  background: #fff3e0;
  color: #e65100;
}

.priority-badge.medium {
  background: #e3f2fd;
  color: #1565c0;
}

.priority-badge.low {
  background: #f1f8e9;
  color: #558b2f;
}

.status-badge {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.status-badge.submitted {
  color: #f57c00;
}

.status-badge.approved {
  color: #2e7d32;
}

.status-badge.rejected {
  color: #c62828;
}

.description {
  font-size: 14px;
  color: #555;
  margin-bottom: 12px;
  line-height: 1.4;
}

.meta-row {
  display: flex;
  gap: 20px;
  font-size: 12px;
  color: #777;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.approval-note {
  padding: 10px 14px;
  background: #f5f5f5;
  border-radius: 6px;
  font-size: 13px;
  color: #555;
  margin-bottom: 12px;
}

.actions {
  border-top: 1px solid #eee;
  padding-top: 14px;
  margin-top: 4px;
}

.note-input {
  margin-bottom: 10px;
}

.note-field {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
}

.note-field:focus {
  outline: none;
  border-color: #2e7d32;
  box-shadow: 0 0 0 2px rgba(46, 125, 50, 0.15);
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.btn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn.approve {
  background: #e8f5e9;
  color: #2e7d32;
}

.btn.approve:hover {
  background: #c8e6c9;
}

.btn.reject {
  background: #ffebee;
  color: #c62828;
}

.btn.reject:hover {
  background: #ffcdd2;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #aaa;
  margin-top: 10px;
}
</style>
