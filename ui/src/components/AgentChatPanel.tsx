import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentChatApi, type AgentChatMessage } from "../api/agentChat";
import { MarkdownBody } from "./MarkdownBody";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { cn, formatDateTime } from "../lib/utils";

interface AgentChatPanelProps {
  issueId: string;
  companyId: string;
  agentId?: string | null;
}

export function AgentChatPanel({
  issueId,
  companyId,
  agentId,
}: AgentChatPanelProps) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chatQueryKey = ["agent-chat", companyId, agentId, issueId] as const;

  const { data: messages = [], isLoading } = useQuery<AgentChatMessage[]>({
    queryKey: chatQueryKey,
    queryFn: () => agentChatApi.listMessages(companyId, agentId!, issueId),
    refetchInterval: 5000,
    enabled: !!agentId,
  });

  const sendMessage = useMutation({
    mutationFn: (body: string) =>
      agentChatApi.sendMessage(companyId, agentId!, body, "user", issueId),
    onSuccess: (newMsg: AgentChatMessage) => {
      queryClient.setQueryData<AgentChatMessage[]>(chatQueryKey, (old) => {
        if (!old) return [newMsg];
        if (old.some((m) => m.id === newMsg.id)) return old;
        return [...old, newMsg];
      });
      setInput("");
      inputRef.current?.focus();
    },
  });

  // Subscribe to live events for real-time chat updates
  useEffect(() => {
    if (!companyId) return;

    let closed = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/api/companies/${encodeURIComponent(companyId)}/events/ws`;
      socket = new WebSocket(url);

      socket.onmessage = (message) => {
        const raw = typeof message.data === "string" ? message.data : "";
        if (!raw) return;

        let event: { type: string; payload?: Record<string, unknown> };
        try {
          event = JSON.parse(raw);
        } catch {
          return;
        }

        if (
          event.type === "issue.chat_message" &&
          event.payload?.["issueId"] === issueId
        ) {
          queryClient.invalidateQueries({ queryKey: chatQueryKey });
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        if (!closed) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (socket) {
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close(1000, "agent_chat_unmount");
      }
    };
  }, [companyId, issueId, queryClient, chatQueryKey]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || sendMessage.isPending) return;
    sendMessage.mutate(trimmed);
  }, [input, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!agentId) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No agent assigned to this issue.
      </p>
    );
  }

  return (
    <div className="flex flex-col h-[500px] border border-border rounded-lg overflow-hidden">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Loading chat…
          </p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No messages yet. Send a message to start chatting with the assigned
            agent.
          </p>
        ) : (
          messages.map((msg) => {
            const isAgent = msg.role === "agent" || msg.role === "assistant";

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-1 max-w-[85%]",
                  isAgent ? "items-start" : "items-end ml-auto",
                )}
              >
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{isAgent ? "Agent" : "You"}</span>
                  <span>{formatDateTime(msg.createdAt)}</span>
                </div>
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
                    isAgent
                      ? "bg-accent/40 border border-border"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  <MarkdownBody className="text-sm [&_p]:m-0">
                    {msg.content}
                  </MarkdownBody>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border p-3 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!input.trim() || sendMessage.isPending}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
