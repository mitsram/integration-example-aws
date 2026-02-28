<template>
  <div class="work-order-form">
    <h2>New Work Order</h2>

    <div v-if="submitMessage" :class="['message', submitSuccess ? 'success' : 'error']">
      {{ submitMessage }}
    </div>

    <form @submit.prevent="handleSubmit">
      <div class="form-group">
        <label for="title">Title *</label>
        <input
          id="title"
          v-model="form.title"
          type="text"
          placeholder="e.g. Server Rack Installation"
          required
        />
      </div>

      <div class="form-group">
        <label for="description">Description *</label>
        <textarea
          id="description"
          v-model="form.description"
          placeholder="Describe the work to be done..."
          rows="3"
          required
        ></textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="priority">Priority *</label>
          <select id="priority" v-model="form.priority" required>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>

        <div class="form-group">
          <label for="dueDate">Due Date *</label>
          <input id="dueDate" v-model="form.dueDate" type="date" required />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="requestedBy">Requested By *</label>
          <input
            id="requestedBy"
            v-model="form.requestedBy"
            type="text"
            placeholder="Your name"
            required
          />
        </div>

        <div class="form-group">
          <label for="department">Department *</label>
          <select id="department" v-model="form.department" required>
            <option value="">Select department</option>
            <option value="Engineering">Engineering</option>
            <option value="Operations">Operations</option>
            <option value="Infrastructure">Infrastructure</option>
            <option value="Security">Security</option>
            <option value="Support">Support</option>
          </select>
        </div>
      </div>

      <button type="submit" :disabled="submitting" class="submit-btn">
        {{ submitting ? "Submitting via SOAP..." : "Submit Work Order" }}
      </button>
    </form>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, reactive } from "vue";
import type { WorkOrderFormData, SubmitResponse } from "../types/work-order";

export default defineComponent({
  name: "WorkOrderForm",
  emits: ["submitted"],
  setup(_, { emit }) {
    const submitting = ref(false);
    const submitMessage = ref("");
    const submitSuccess = ref(false);

    const form = reactive<WorkOrderFormData>({
      title: "",
      description: "",
      priority: "MEDIUM",
      requestedBy: "",
      department: "",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
    });

    async function handleSubmit() {
      submitting.value = true;
      submitMessage.value = "";

      try {
        const res = await fetch("/api/work-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });

        const data: SubmitResponse = await res.json();

        if (data.success) {
          submitSuccess.value = true;
          submitMessage.value = `Work order "${data.workOrder.title}" submitted successfully! (SOAP Status: ${data.soapResponse.status})`;
          emit("submitted", data.workOrder);
          resetForm();
        } else {
          submitSuccess.value = false;
          submitMessage.value = "Failed to submit work order. Please try again.";
        }
      } catch (err) {
        submitSuccess.value = false;
        submitMessage.value = `Error: ${err instanceof Error ? err.message : "Unknown error"}`;
      } finally {
        submitting.value = false;
      }
    }

    function resetForm() {
      form.title = "";
      form.description = "";
      form.priority = "MEDIUM";
      form.requestedBy = "";
      form.department = "";
      form.dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
    }

    return { form, submitting, submitMessage, submitSuccess, handleSubmit };
  },
});
</script>

<style scoped>
.work-order-form h2 {
  margin-bottom: 16px;
  color: #1a73e8;
  font-size: 18px;
}

.message {
  padding: 10px 14px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 13px;
}

.message.success {
  background: #e6f4ea;
  color: #1e7e34;
  border: 1px solid #b7e1cd;
}

.message.error {
  background: #fce8e6;
  color: #c5221f;
  border: 1px solid #f5c6cb;
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #444;
  margin-bottom: 4px;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #1a73e8;
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.15);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.submit-btn {
  width: 100%;
  padding: 10px;
  background: #1a73e8;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 8px;
}

.submit-btn:hover:not(:disabled) {
  background: #1557b0;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
