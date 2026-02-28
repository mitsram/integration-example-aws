<template>
  <div class="app">
    <header class="app-header">
      <div class="header-content">
        <h1>📋 Work Order Creator</h1>
        <p class="subtitle">Core App 2 – Create and submit work orders for approval</p>
      </div>
    </header>

    <main class="app-main">
      <div class="layout">
        <section class="form-section">
          <WorkOrderForm @submitted="onWorkOrderSubmitted" />
        </section>
        <section class="list-section">
          <WorkOrderList :work-orders="workOrders" @refresh="fetchWorkOrders" />
        </section>
      </div>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from "vue";
import WorkOrderForm from "./components/WorkOrderForm.vue";
import WorkOrderList from "./components/WorkOrderList.vue";
import type { WorkOrder } from "./types/work-order";

export default defineComponent({
  name: "App",
  components: { WorkOrderForm, WorkOrderList },
  setup() {
    const workOrders = ref<WorkOrder[]>([]);

    async function fetchWorkOrders() {
      try {
        const res = await fetch("/api/work-orders");
        const data = await res.json();
        workOrders.value = data.workOrders;
      } catch (err) {
        console.error("Failed to fetch work orders:", err);
      }
    }

    function onWorkOrderSubmitted(wo: WorkOrder) {
      workOrders.value.unshift(wo);
    }

    onMounted(fetchWorkOrders);

    // Poll for status updates every 10s
    setInterval(fetchWorkOrders, 10000);

    return { workOrders, fetchWorkOrders, onWorkOrderSubmitted };
  },
});
</script>

<style>
.app {
  min-height: 100vh;
  background: #f0f2f5;
}

.app-header {
  background: linear-gradient(135deg, #1a73e8, #0d47a1);
  color: white;
  padding: 24px 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
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

.app-main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

.form-section,
.list-section {
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
</style>
