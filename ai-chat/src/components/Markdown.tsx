import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Box, Code, Table, Text, UnstyledButton, Tooltip } from "@mantine/core";
import { Copy } from "lucide-react";
import "./markdown.css";

/**
 * Markdown rendering for assistant replies: GFM tables/lists, inline code,
 * and fenced code blocks with a language label + copy button. Content is
 * rendered as React nodes (no raw HTML pass-through), so model output has
 * no script-injection surface.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <Box className="ai-chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children }) {
            const raw = String(children);
            const match = /language-(\w+)/.exec(className ?? "");
            const isBlock = match !== null || raw.includes("\n");
            if (!isBlock) {
              return <Code fz="inherit">{children}</Code>;
            }
            return <CodeBlock lang={match?.[1] ?? ""} code={raw.replace(/\n$/, "")} />;
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <Box my="sm" style={{ overflowX: "auto" }}>
              <Table component="table" withTableBorder striped highlightOnHover>
                {children}
              </Table>
            </Box>
          ),
          p: ({ children }) => (
            <Text component="p" fz="sm" style={{ whiteSpace: "pre-wrap" }}>
              {children}
            </Text>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </Box>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <Box
      my="sm"
      bg="var(--mantine-color-dark-8)"
      style={{ borderRadius: "var(--mantine-radius-md)", overflow: "hidden" }}
    >
      <Box
        px="sm"
        py={4}
        fz="xs"
        c="var(--mantine-color-gray-5)"
        bg="var(--mantine-color-dark-7)"
        style={{ userSelect: "none" }}
      >
        <Tooltip label="Copy code" withArrow>
          <UnstyledButton
            onClick={() => void navigator.clipboard.writeText(code)}
            aria-label="Copy code"
            mr="xs"
            style={{ color: "var(--mantine-color-gray-5)", verticalAlign: "middle" }}
          >
            <Copy size={12} />
          </UnstyledButton>
        </Tooltip>
        {lang}
      </Box>
      <Box
        component="code"
        display="block"
        px="sm"
        py="xs"
        c="var(--mantine-color-gray-3)"
        fz="xs"
        style={{ whiteSpace: "pre", overflowX: "auto" }}
      >
        {code}
      </Box>
    </Box>
  );
}
