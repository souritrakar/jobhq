// To-do section tests — jsdom. These exercise ui/todo.js's local-first contract: the module never
// touches the backend, it just mutates an in-memory list and reports it through onChange. We assert
// the shapes onChange receives for each interaction (add plain / add dated / toggle / convert /
// delete) plus the due-label rendering (overdue vs upcoming). The save-time reconcile lives in
// content.js and is out of scope here.
import { describe, it, expect, beforeEach } from "vitest";

import "./todo.js";

function mount(ctx) {
  const container = document.createElement("div");
  document.body.append(container);
  const changes = [];
  self.JTTodo.render(container, {
    todos: [],
    deleted: [],
    onChange: (todos, deleted) => changes.push({ todos: todos.map((t) => ({ ...t })), deleted: deleted.slice() }),
    ...ctx,
  });
  return { container, changes, last: () => changes[changes.length - 1] };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("composer", () => {
  it("adds a plain to-do on Enter (no due date)", () => {
    const { container, changes, last } = mount();
    const input = container.querySelector(".jt-todo-input");
    input.value = "Follow up with recruiter";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(changes.length).toBe(1);
    expect(last().todos).toHaveLength(1);
    const [t] = last().todos;
    expect(t.title).toBe("Follow up with recruiter");
    expect(t.done).toBe(false);
    expect(t.dueAt).toBeUndefined();
    expect(t.id).toBeTruthy();
    // Renders the row and clears the composer.
    expect(container.querySelectorAll(".jt-todo-item")).toHaveLength(1);
    expect(input.value).toBe("");
  });

  it("ignores an empty / whitespace-only task", () => {
    const { container, changes } = mount();
    const input = container.querySelector(".jt-todo-input");
    input.value = "   ";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(changes.length).toBe(0);
  });

  it("keeps the bell disabled until there's text", () => {
    const { container } = mount();
    const bell = container.querySelector(".jt-todo-bell");
    const input = container.querySelector(".jt-todo-input");
    expect(bell.disabled).toBe(true);
    input.value = "x";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(bell.disabled).toBe(false);
  });

  it("adds a dated reminder via the bell → chip → Set reminder", () => {
    const { container, last } = mount();
    const input = container.querySelector(".jt-todo-input");
    input.value = "Prep for interview";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    container.querySelector(".jt-todo-bell").click();

    const sched = container.querySelector(".jt-todo-sched");
    expect(sched).toBeTruthy();
    sched.querySelector(".jt-todo-chip").click(); // "Tomorrow"
    const setBtn = sched.querySelector(".jt-todo-set");
    expect(setBtn.disabled).toBe(false);
    setBtn.click();

    const [t] = last().todos;
    expect(t.title).toBe("Prep for interview");
    expect(t.dueAt).toBeTruthy();
    expect(t.hasTime).toBe(false); // date-only chip defaults to 9am, no explicit time
    // Popover closes after picking.
    expect(container.querySelector(".jt-todo-sched")).toBeNull();
  });

  it("disables Set reminder until a date is chosen", () => {
    const { container } = mount();
    const input = container.querySelector(".jt-todo-input");
    input.value = "Something";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    container.querySelector(".jt-todo-bell").click();
    expect(container.querySelector(".jt-todo-set").disabled).toBe(true);
  });
});

describe("existing rows", () => {
  it("toggles done", () => {
    const { container, last } = mount({ todos: [{ id: "a", title: "Task", done: false }] });
    container.querySelector(".jt-todo-check").click();
    expect(last().todos[0].done).toBe(true);
    expect(container.querySelector(".jt-todo-item").classList.contains("done")).toBe(true);
  });

  it("deletes an unsynced to-do without queueing a remote delete", () => {
    const { container, last } = mount({ todos: [{ id: "a", title: "Task", done: false }] });
    container.querySelector(".jt-todo-del").click();
    expect(last().todos).toHaveLength(0);
    expect(last().deleted).toEqual([]);
  });

  it("queues a synced to-do's remoteId for deletion", () => {
    const { container, last } = mount({
      todos: [{ id: "a", title: "Task", done: false, remoteId: "r1", synced: { done: false, dueAt: null, hasTime: false } }],
    });
    container.querySelector(".jt-todo-del").click();
    expect(last().todos).toHaveLength(0);
    expect(last().deleted).toEqual(["r1"]);
  });

  it("converts a plain to-do into a reminder via its bell", () => {
    const { container, last } = mount({ todos: [{ id: "a", title: "Task", done: false }] });
    container.querySelector(".jt-todo-convert").click();
    const sched = container.querySelector(".jt-todo-sched");
    expect(sched).toBeTruthy();
    sched.querySelector(".jt-todo-chip").click();
    sched.querySelector(".jt-todo-set").click();
    expect(last().todos[0].dueAt).toBeTruthy();
  });

  it("shows an overdue pill for a past due date, a plain due for a future one", () => {
    const { container } = mount({
      todos: [
        { id: "past", title: "Late", done: false, dueAt: "2000-01-01T09:00:00.000Z", hasTime: false },
        { id: "future", title: "Soon", done: false, dueAt: "2999-01-01T09:00:00.000Z", hasTime: false },
      ],
    });
    const rows = container.querySelectorAll(".jt-todo-item");
    expect(rows[0].querySelector(".jt-todo-overdue")).toBeTruthy();
    expect(rows[1].querySelector(".jt-todo-due")).toBeTruthy();
    expect(rows[1].querySelector(".jt-todo-overdue")).toBeNull();
  });

  it("renders an Auto badge for system reminders and hides convert/delete", () => {
    const { container } = mount({
      todos: [{ id: "sys", title: "Interview", done: false, type: "system", remoteId: "r9" }],
    });
    const row = container.querySelector(".jt-todo-item");
    expect(row.querySelector(".jt-todo-auto")).toBeTruthy();
    expect(row.querySelector(".jt-todo-del")).toBeNull();
    expect(row.querySelector(".jt-todo-convert")).toBeNull();
  });

  it("sorts done items below open ones after a toggle", () => {
    const { container, last } = mount({
      todos: [
        { id: "a", title: "First", done: false },
        { id: "b", title: "Second", done: false },
      ],
    });
    // Complete the first — it should drop below the still-open second.
    container.querySelectorAll(".jt-todo-check")[0].click();
    const titles = last().todos.map((t) => t.title);
    expect(titles).toEqual(["Second", "First"]);
  });
});
