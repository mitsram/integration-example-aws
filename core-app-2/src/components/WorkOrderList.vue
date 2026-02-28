<template>
  <div class="work-order-list">
    <div class="list-header">
      <h2>Submitted Work Orders</h2>
      <button class="refresh-btn" @click="$emit('refresh')" title="Refresh statuses">
        🔄 Refresh
      </button>
    </div>

    <div v-if="workOrders.length === 0" class="empty-state">
      <p>No work orders submitted yet.</p>
      <p class="hint">Create a work order using the form to get started.</p>
    </div>

    <div v-else class="orders">
      <div
        v-for="wo in workOrders"
        :key="wo.id"
        class="order-card"
        :class="wo.status.toLowerCase()"
      >
        <div class="order-header">
          <span class="order-title">{{ wo.title }}</span>
          <span :class="['status-badge', wo.status.toLowerCase()]">
            {{ wo.status }}
          </span>
        </div>
        <p class="order-desc">{{ wo.description }}</p>
        <div class="order-meta">
          <span>📌 {{ wo.priority }}</span>
          <span>👤 {{ wo.requestedBy }}</span>
          <span>🏢 {{ wo.department }}</span>
          <span>📅 {{ wo.dueDate }}</span>
        </div>
        <div class="order-footer">
          <span class="order-id">ID: {{ wo.id }}</span>
          <span class="order-date">Created: {{ formatDate(wo.createdAt) }}</span>
        </div>
        <div v-if="wo.approvalNote" class="approval-note">
          💬 {{ wo.approvalNote }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import type { WorkOrder } from "../types/work-order";

export default defineComponent({
  name: "WorkOrderList",
  props: {
    workOrders: {
      type: Array as PropType<WorkOrder[]>,
      required: true,
    },
  },
  emits: ["refresh"],
  setup() {
    function formatDate(dateStr: string): string {
      return new Date(dateStr).toLocaleString();
    }
    return { formatDate };
  },
});
</script>

<style scoped>
.work-order-list h2 {
  color: #1a73e8;
  font-size: 18px;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.refresh-btn {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 13px;
}

.refresh-btn:hover {
  background: #f5f5f5;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #888;
}

.hint {
  font-size: 13px;
  margin-top: 8px;
}

.orders {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 600px;
  overflow-y: auto;
}

.order-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 14px;
  transition: box-shadow 0.2s;
  border-left: 4px solid #ccc;
}

.order-card.submitted {
  border-left-color: #fb8c00;
}

.order-card.approved {
  border-left-color: #43a047;
}

.order-card.rejected {
  border-left-color: #e53935;
}

.order-card.draft {
  border-left-color: #90a4ae;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.order-title {
  font-weight: 600;
  font-size: 15px;
  color: #333;
}

.status-badge {
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.submitted {
  background: #fff3e0;
  color: #e65100;
}

.status-badge.approved {
  background: #e8f5e9;
  color: #2e7d32;
}

.status-badge.rejected {
  background: #ffebee;
  color: #c62828;
}

.status-badge.draft {
  background: #eceff1;
  color: #546e7a;
}

.order-desc {
  font-size: 13px;
  color: #555;
  margin-bottom: 8px;
}

.order-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #777;
  flex-wrap: wrap;
}

.order-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: #999;
}

.approval-note {
  margin-top: 8px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 6px;
  font-size: 13px;
  color: #555;
}
</style>
