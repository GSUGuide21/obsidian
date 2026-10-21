import type { Attachment as AttachmentType } from "@/lib/chat/types";
import Audio from "./Audio";
import Event, { type RsvpContext } from "./Event";
import External from "./External";
import File from "./File";
import Picture from "./Image";
import Link from "./Link";
import Poll, { type PollContext } from "./Poll";
import Quiz, { type QuizContext } from "./Quiz";
import Sticker from "./Sticker";
import Video from "./Video";
import Voice from "./Voice";

/**
 * Renders the attachments that sit below the message text.
 * Mentions and replies are placed inline by Message itself.
 */
export default function Attachment({
  attachment,
  poll,
  quiz,
  onManageEvent,
  rsvp,
}: {
  attachment: AttachmentType;
  poll?: PollContext;
  /** Quizzes: your answer, and answering. */
  quiz?: QuizContext;
  /** Events: its creator and moderators can open the editor. */
  onManageEvent?: () => void;
  /** Events: answering Going. */
  rsvp?: RsvpContext;
}) {
  switch (attachment.type) {
    case "image":
      return <Picture attachment={attachment} />;
    case "video":
      return <Video attachment={attachment} />;
    case "audio":
      return <Audio attachment={attachment} />;
    case "voice":
      return <Voice attachment={attachment} />;
    case "file":
      return <File attachment={attachment} />;
    case "poll":
      return <Poll attachment={attachment} poll={poll} />;
    case "quiz":
      return <Quiz attachment={attachment} quiz={quiz} />;
    case "event":
      return <Event attachment={attachment} onManage={onManageEvent} rsvp={rsvp} />;
    case "link":
      return <Link attachment={attachment} />;
    case "external":
      return <External attachment={attachment} />;
    case "sticker":
      return <Sticker attachment={attachment} />;
    case "mention":
    case "reply":
    case "forward":
      return null;
  }
}
