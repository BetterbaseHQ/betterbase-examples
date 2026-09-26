import { useState } from "react";
import { Checkbox, TextInput, ActionIcon, Group, Stack, Text, Paper } from "@mantine/core";
import { Plus, Trash2 } from "lucide-react";
import {
  EmptyState,
  ShareButton,
  MembersPanel,
  RemovedSpaceNotice,
  reportError,
  noRemovedSpaces,
  type RemovedSpaceProbe,
} from "@betterbase/examples-shared";
import { isShared } from "betterbase/sync";
import { CheckSquare } from "lucide-react";
import type { List, TodoItem } from "@/lib/db";

interface TaskListProps {
  list: List & { _spaceId?: string };
  personalSpaceId?: string | null;
  isAdmin?: boolean;
  onAddTodo: (listId: string, text: string) => void | Promise<void>;
  onToggleTodo: (listId: string, todoId: string) => void | Promise<void>;
  onDeleteTodo: (listId: string, todoId: string) => void | Promise<void>;
  onShare?: (handle: string) => Promise<void>;
  onInvite?: (handle: string) => Promise<void>;
  onRemoveMember?: (did: string) => Promise<void>;
  /** Reactive removed-space probe injected by the synced path (local path stays inert). */
  useRemovedSpace?: RemovedSpaceProbe;
  /** Local cleanup for the victim's copy of the whole list. */
  onDeleteLocalCopy?: () => void | Promise<void>;
}

export function TaskList({
  list,
  personalSpaceId,
  isAdmin = false,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onShare,
  onInvite,
  onRemoveMember,
  useRemovedSpace = noRemovedSpaces,
  onDeleteLocalCopy,
}: TaskListProps) {
  const [newTodoText, setNewTodoText] = useState("");
  const [deletingLocalCopy, setDeletingLocalCopy] = useState(false);

  const handleAdd = () => {
    const text = newTodoText.trim();
    if (!text) return;
    onAddTodo(list.id, text);
    setNewTodoText("");
  };

  const active = list.todos.filter((t) => !t.completed);
  const completed = list.todos.filter((t) => t.completed);

  const shared = isShared(list, personalSpaceId);
  const isPersonal = !shared;

  // Called as a hook every render (stable identity per app path) — the `use`
  // prefix keeps eslint's rules-of-hooks enforcing the unconditional call.
  const removedSpace = useRemovedSpace(list._spaceId ?? null);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={600} size="xl">
          {list.name}
        </Text>
        {isPersonal && onShare && <ShareButton onShare={onShare} />}
        {shared && list._spaceId && onInvite && onRemoveMember && (
          <MembersPanel
            spaceId={list._spaceId}
            isAdmin={isAdmin}
            onInvite={onInvite}
            onRemoveMember={onRemoveMember}
          />
        )}
      </Group>

      {removedSpace.removed ? (
        <RemovedSpaceNotice
          kindLabel="list"
          name={removedSpace.name}
          deleting={deletingLocalCopy}
          onDeleteLocalCopy={
            onDeleteLocalCopy
              ? () => {
                  setDeletingLocalCopy(true);
                  Promise.resolve(onDeleteLocalCopy())
                    .catch((err) => reportError(err, "Couldn't delete local copy"))
                    .finally(() => setDeletingLocalCopy(false));
                }
              : undefined
          }
        />
      ) : list.todos.length === 0 ? (
        <EmptyState
          icon={<CheckSquare size={32} />}
          title="No tasks yet"
          description="Add your first task below"
        />
      ) : (
        <Stack gap="xs">
          {active.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              listId={list.id}
              onToggle={onToggleTodo}
              onDelete={onDeleteTodo}
            />
          ))}

          {completed.length > 0 && active.length > 0 && (
            <Text size="xs" c="dimmed" mt="sm">
              Completed ({completed.length})
            </Text>
          )}

          {completed.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              listId={list.id}
              onToggle={onToggleTodo}
              onDelete={onDeleteTodo}
            />
          ))}
        </Stack>
      )}

      {!removedSpace.removed && (
        <TextInput
          placeholder="Add a task..."
          aria-label="New task"
          size="md"
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          rightSection={
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Add task"
              onClick={handleAdd}
              disabled={!newTodoText.trim()}
            >
              <Plus size={16} />
            </ActionIcon>
          }
        />
      )}
    </Stack>
  );
}

function TodoRow({
  todo,
  listId,
  onToggle,
  onDelete,
}: {
  todo: TodoItem;
  listId: string;
  onToggle: (listId: string, todoId: string) => void | Promise<void>;
  onDelete: (listId: string, todoId: string) => void | Promise<void>;
}) {
  return (
    <Paper p="xs" withBorder style={{ opacity: todo.completed ? 0.6 : 1 }}>
      <Group justify="space-between" wrap="nowrap">
        <Checkbox
          checked={todo.completed}
          onChange={() => onToggle(listId, todo.id)}
          label={
            <Text
              size="sm"
              td={todo.completed ? "line-through" : undefined}
              c={todo.completed ? "dimmed" : undefined}
            >
              {todo.text}
            </Text>
          }
          styles={{ body: { alignItems: "center" } }}
        />
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label={`Delete task ${todo.text}`}
          onClick={() => onDelete(listId, todo.id)}
        >
          <Trash2 size={14} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}
