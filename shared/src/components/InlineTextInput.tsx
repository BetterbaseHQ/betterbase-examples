import { TextInput } from "@mantine/core";

interface InlineTextInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter, or blur with a non-empty value */
  onSubmit: () => void;
  /** Escape, or blur with an empty value */
  onCancel: () => void;
  placeholder?: string;
  ariaLabel?: string;
  size?: "xs" | "sm";
  /** Autofocus on mount (default: true) */
  autoFocus?: boolean;
  style?: React.CSSProperties;
}

/**
 * The inline editor used for sidebar "new item" rows and click-to-rename
 * fields: Enter commits, Escape cancels, blur commits when non-empty.
 */
export function InlineTextInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  ariaLabel,
  size = "xs",
  autoFocus = true,
  style,
}: InlineTextInputProps) {
  return (
    <TextInput
      size={size}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmit();
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => {
        if (value.trim()) onSubmit();
        else onCancel();
      }}
      autoFocus={autoFocus}
      style={style}
    />
  );
}
