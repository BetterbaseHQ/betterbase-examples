import { useState } from "react";
import { Checkbox, TextInput, ActionIcon, Group, Stack, Text, Paper } from "@mantine/core";
import { Plus, Trash2 } from "lucide-react";
import { EmptyState, ShareButton, MembersPanel } from "@betterbase/examples-shared";
import { CheckSquare } from "lucide-react";
import type { List, TodoItem } from "@/lib/db";

interface TaskListProps {
  list: List & { _spaceId?: string };
  personalSpaceId?: string | null;
  isAdmin?: boolean;
  onAddTodo: (listId: string, text: string) => void;
  onToggleTodo: (listId: string, todoId: string) => void;
  onDeleteTodo: (listId: string, todoId: string) => void;
  onShare?: (handle: string) => Promise<void>;
  onInvite?: (handle: string) => Promise<void>;
  onRemoveMember?: (did: string) => Promise<void>;
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
}: TaskListProps) {
  const [newTodoText, setNewTodoText] = useState("");

  const handleAdd = () => {
    const text = newTodoText.trim();
    if (!text) return;
    onAddTodo(list.id, text);
    setNewTodoText("");
  };

  const active = list.todos.filter((t) => !t.completed);
  const completed = list.todos.filter((t) => t.completed);

  const isPersonal = list._spaceId == null || list._spaceId === personalSpaceId;
  const isShared = list._spaceId != null && list._spaceId !== personalSpaceId;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={600} size="xl">
          {list.name}
        </Text>
        {isPersonal && onShare && <ShareButton onShare={onShare} />}
        {isShared && list._spaceId && onInvite && onRemoveMember && (
          <MembersPanel
            spaceId={list._spaceId}
            isAdmin={isAdmin}
            onInvite={onInvite}
            onRemoveMember={onRemoveMember}
          />
        )}
      </Group>

      {list.todos.length === 0 ? (
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

      <TextInput
        placeholder="Add a task..."
        size="md"
        value={newTodoText}
        onChange={(e) => setNewTodoText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
        }}
        rightSection={
          <ActionIcon size="sm" variant="subtle" onClick={handleAdd} disabled={!newTodoText.trim()}>
            <Plus size={16} />
          </ActionIcon>
        }
      />
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
  onToggle: (listId: string, todoId: string) => void;
  onDelete: (listId: string, todoId: string) => void;
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
          onClick={() => onDelete(listId, todo.id)}
        >
          <Trash2 size={14} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}
