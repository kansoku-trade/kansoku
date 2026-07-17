import { LockedAiNotice } from "../../LockedAiNotice";

export function LockedChatBar() {
  return (
    <div className="chat-dock chat-dock--locked">
      <LockedAiNotice message="追问功能需要有效授权" />
    </div>
  );
}
