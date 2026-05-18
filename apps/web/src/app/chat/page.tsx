import { ChatPanel } from "@/components/ChatPanel";

export default function ChatPage() {
  return (
    <div className="flex h-[calc(100vh-0px)] min-h-0 flex-1 flex-col md:h-screen">
      <ChatPanel />
    </div>
  );
}
