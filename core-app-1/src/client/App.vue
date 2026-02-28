<template>
  <div class="app">
    <header class="app-header">
      <div class="header-content">
        <h1>✅ Work Order Approval</h1>
        <p class="subtitle">Core App 1 – Review and approve/reject work orders</p>
      </div>
      <div class="header-stats">
        <span class="stat pending">{{ pendingCount }} Pending</span>
        <span class="stat approved">{{ approvedCount }} Approved</span>
        <span class="stat rejected">{{ rejectedCount }} Rejected</span>
      </div>
    </header>

    <main class="app-main">
      <div class="toolbar">
        <div class="filter-group">
          <button
            v-for="f in filters"
            :key="f.value"
            :class="['filter-btn', { active: activeFilter === f.value }]"
            @click="activeFilter = f.value"
          >
            {{ f.label }}
          </button>
        </div>
        <button class="refresh-btn" @click="fetchWorkOrders">🔄 Refresh</button>
      </div>

      <div v-if="filteredOrders.length === 0" class="empty-state">
        <p>No work orders {{ activeFilter === 'ALL' ? 'received' : 'with status ' + activeFilter }}.</p>
        <p class="hint">Work orders sent from Core App 2 via SOAP will appear here.</p>
      </div>

      <div v-else class="orders-grid">
        <WorkOrderCard
          v-for="wo in filteredOrders"
          :key="wo.id"
          :work-order="wo"
          @approve="handleApprove"
          @reject="handleReject"
        />
      </div>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted } from "vue";
import WorkOrderCard from "./components/WorkOrderCard.vue";

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
  name: "App",
  components: { WorkOrderCard },
  setup() {
    const workOrders = ref<WorkOrder[]>([]);
    const activeFilter = ref("ALL");

    const filters = [
      { label: "All", value: "ALL" },
      { label: "Pending", value: "SUBMITTED" },
      { label: "Approved", value: "APPROVED" },
      { label: "Rejected", value: "REJECTED" },
    ];

    const filteredOrders = computed(() => {
      if (activeFilter.value === "ALL") return workOrders.value;
      return workOrders.value.filter((wo) => wo.status === activeFilter.value);
    });

    const pendingCount = computed(
      () => workOrders.value.filter((wo) => wo.status === "SUBMITTED").length
    );
    const approvedCount = computed(
      () => workOrders.value.filter((wo) => wo.status === "APPROVED").length
    );
    const rejectedCount = computed(
      () => workOrders.value.filter((wo) => wo.status === "REJECTED").length
    );

    async function fetchWorkOrders() {
      try {
        const res = await fetch("/api/work-orders");
        const data = await res.json();
        workOrders.value = data.workOrders;
      } catch (err) {
        console.error("Failed to fetch work orders:", err);
      }
    }

    async function handleApprove(id: string, note: string) {
      try {
        const res = await fetch(`/api/work-orders/${id}/approve`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        });
        if (res.ok) {
          await fetchWorkOrders();
        }
      } catch (err) {
        console.error("Failed to approve:", err);
      }
    }

    async function handleReject(id: string, note: string) {
      try {
        const res = await fetch(`/api/work-orders/${id}/reject`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        });
        if (res.ok) {
          await fetchWorkOrders();
        }
      } catch (err) {
        console.error("Failed to reject:", err);
      }
    }

    onMounted(fetchWorkOrders);
    // Auto-refresh every 5 seconds for real-time updates
    setInterval(fetchWorkOrders, 5000);

    return {
      workOrders,
      activeFilter,
      filters,
      filteredOrders,
      pendingCount,
      approvedCount,
      rejectedCount,
      fetchWorkOrders,
      handleApprove,
      handleReject,
    };
  },
});
</script>

<style>
.app {
  min-height: 100vh;
  background: #f0f2f5;
}

.app-header {
  background: linear-gradient(135deg, #2e7d32, #1b5e20);
  color: white;
  padding: 24px 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-content h1 {
  font-size: 24px;
  font-weight: 600;
}

.subtitle {
  opacity: 0.85;
  margin-top: 4px;
  font-size: 14px;
}

.header-stats {
  display: flex;
  gap: 12px;
}

.stat {
  padding: 4px 14px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 600;
}

.stat.pending {
  background: rgba(255, 167, 38, 0.25);
  color: #fff;
}

.stat.approved {
  background: rgba(129, 199, 132, 0.3);
  color: #fff;
}

.stat.rejected {
  background: rgba(239, 83, 80, 0.3);
  color: #fff;
}

.app-main {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.filter-group {
  display: flex;
  gap: 8px;
}

.filter-btn {
  padding: 6px 16px;
  border: 1px solid #ddd;
  border-radius: 20px;
  background: white;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.filter-btn.active {
  background: #2e7d32;
  color: white;
  border-color: #2e7d32;
}

.filter-btn:hover:not(.active) {
  background: #f5f5f5;
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
  padding: 60px 20px;
  color: #888;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

.hint {
  font-size: 13px;
  margin-top: 8px;
}

.orders-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
