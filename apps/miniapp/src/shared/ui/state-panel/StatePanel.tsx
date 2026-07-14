import { Button, Text, View } from "@tarojs/components";
import "./state-panel.css";

interface StatePanelProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function StatePanel({ message, actionLabel, onAction }: StatePanelProps) {
  return (
    <View className="state-panel">
      <Text className="state-panel__message">{message}</Text>
      {actionLabel && onAction ? (
        <Button className="secondary-button state-panel__action" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}
