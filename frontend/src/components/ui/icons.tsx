/**
 * App icons: Solar outline (linear) icons from Iconify, rendered as CSS by @iconify/tailwind4 (bundled offline, no requests
 * to Iconify at runtime, and only icons used here end up in the CSS).
 * Names match what the screens use, so swapping a glyph only changes this file.
 * Tailwind finds the icon classes by scanning this file, so keep each class written out in full.
 */
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface IconProps extends HTMLAttributes<HTMLSpanElement> {
  /** Accepted for compatibility; Solar outline icons have a fixed stroke. */
  strokeWidth?: number;
  /** Pixel size when no size class is given. */
  size?: number;
}

export type IconComponent = (props: IconProps) => React.JSX.Element;

function icon(glyph: string, name: string): IconComponent {
  function Icon({ className, strokeWidth, size, style, ...rest }: IconProps) {
    void strokeWidth; // fixed stroke in Solar icons
    // Default to 24px like the old line icons, unless a size class or size prop is given.
    const sized = size !== undefined || /(^|\s)(size|w|h)-/.test(className ?? "");
    const labelled = Boolean(rest["aria-label"]);
    return (
      <span
        role={labelled ? "img" : undefined}
        aria-hidden={labelled ? undefined : true}
        {...rest}
        className={cn("inline-block shrink-0 align-middle", !sized && "size-6", glyph, className)}
        style={size !== undefined ? { width: size, height: size, ...style } : style}
      />
    );
  }
  Icon.displayName = name;
  return Icon;
}

export const AlertCircle = icon("icon-[solar--danger-circle-linear]", "AlertCircle");
export const AlertTriangle = icon("icon-[solar--danger-triangle-linear]", "AlertTriangle");
export const Archive = icon("icon-[solar--archive-linear]", "Archive");
export const ArrowDownRight = icon("icon-[solar--arrow-right-down-linear]", "ArrowDownRight");
export const ArrowLeft = icon("icon-[solar--arrow-left-linear]", "ArrowLeft");
export const ArrowRight = icon("icon-[solar--arrow-right-linear]", "ArrowRight");
export const ArrowUpRight = icon("icon-[solar--arrow-right-up-linear]", "ArrowUpRight");
export const Ban = icon("icon-[solar--forbidden-circle-linear]", "Ban");
export const Banknote = icon("icon-[solar--banknote-2-linear]", "Banknote");
export const BarChart3 = icon("icon-[solar--chart-2-linear]", "BarChart3");
export const Briefcase = icon("icon-[solar--case-round-linear]", "Briefcase");
export const CalendarClock = icon("icon-[solar--calendar-mark-linear]", "CalendarClock");
export const CalendarDays = icon("icon-[solar--calendar-linear]", "CalendarDays");
export const CalendarRange = icon("icon-[solar--calendar-date-linear]", "CalendarRange");
export const CalendarX2 = icon("icon-[solar--calendar-minimalistic-linear]", "CalendarX2");
export const Check = icon("icon-[solar--check-circle-linear]", "Check");
export const CheckCircle2 = icon("icon-[solar--check-circle-linear]", "CheckCircle2");
export const ChevronLeft = icon("icon-[solar--alt-arrow-left-linear]", "ChevronLeft");
export const ChevronRight = icon("icon-[solar--alt-arrow-right-linear]", "ChevronRight");
export const ClipboardCheck = icon("icon-[solar--clipboard-check-linear]", "ClipboardCheck");
export const ClipboardList = icon("icon-[solar--clipboard-list-linear]", "ClipboardList");
export const Clock = icon("icon-[solar--clock-circle-linear]", "Clock");
export const Columns3 = icon("icon-[solar--widget-6-linear]", "Columns3");
export const CreditCard = icon("icon-[solar--card-linear]", "CreditCard");
export const Download = icon("icon-[solar--download-minimalistic-linear]", "Download");
export const ExternalLink = icon("icon-[solar--square-arrow-right-up-linear]", "ExternalLink");
export const Eye = icon("icon-[solar--eye-linear]", "Eye");
export const EyeOff = icon("icon-[solar--eye-closed-linear]", "EyeOff");
export const FileClock = icon("icon-[solar--document-text-linear]", "FileClock");
export const FilePenLine = icon("icon-[solar--pen-new-square-linear]", "FilePenLine");
export const FileSignature = icon("icon-[solar--document-add-linear]", "FileSignature");
export const FileText = icon("icon-[solar--document-text-linear]", "FileText");
export const FileUp = icon("icon-[solar--file-send-linear]", "FileUp");
export const Film = icon("icon-[solar--videocamera-record-linear]", "Film");
export const FolderDown = icon("icon-[solar--folder-with-files-linear]", "FolderDown");
export const Grid2X2 = icon("icon-[solar--widget-linear]", "Grid2X2");
export const GripVertical = icon("icon-[solar--hamburger-menu-linear]", "GripVertical");
export const ImageIcon = icon("icon-[solar--gallery-linear]", "ImageIcon");
export const ImageOff = icon("icon-[solar--gallery-remove-linear]", "ImageOff");
export const ImageUp = icon("icon-[solar--gallery-send-linear]", "ImageUp");
export const Images = icon("icon-[solar--gallery-wide-linear]", "Images");
export const Inbox = icon("icon-[solar--inbox-linear]", "Inbox");
export const Layers = icon("icon-[solar--layers-linear]", "Layers");
export const LayoutDashboard = icon("icon-[solar--widget-2-linear]", "LayoutDashboard");
export const List = icon("icon-[solar--list-linear]", "List");
export const ListChecks = icon("icon-[solar--checklist-minimalistic-linear]", "ListChecks");
export const ListTodo = icon("icon-[solar--checklist-linear]", "ListTodo");
export const Loader2 = icon("icon-[solar--refresh-circle-linear]", "Loader2");
export const LogOut = icon("icon-[solar--logout-2-linear]", "LogOut");
export const MailCheck = icon("icon-[solar--letter-opened-linear]", "MailCheck");
export const MapPin = icon("icon-[solar--map-point-linear]", "MapPin");
export const Megaphone = icon("icon-[solar--speaker-linear]", "Megaphone");
export const Menu = icon("icon-[solar--hamburger-menu-linear]", "Menu");
export const MessageSquare = icon("icon-[solar--chat-square-linear]", "MessageSquare");
export const MousePointerClick = icon("icon-[solar--cursor-linear]", "MousePointerClick");
export const MoveRight = icon("icon-[solar--arrow-right-linear]", "MoveRight");
export const Paperclip = icon("icon-[solar--paperclip-linear]", "Paperclip");
export const PanelLeftClose = icon("icon-[solar--sidebar-minimalistic-linear]", "PanelLeftClose");
export const PenTool = icon("icon-[solar--pen-2-linear]", "PenTool");
export const Pencil = icon("icon-[solar--pen-linear]", "Pencil");
export const PiggyBank = icon("icon-[solar--safe-2-linear]", "PiggyBank");
export const Plus = icon("icon-[solar--add-circle-linear]", "Plus");
export const Printer = icon("icon-[solar--printer-linear]", "Printer");
export const Receipt = icon("icon-[solar--bill-list-linear]", "Receipt");
export const Repeat = icon("icon-[solar--repeat-linear]", "Repeat");
export const Rocket = icon("icon-[solar--rocket-linear]", "Rocket");
export const RotateCcw = icon("icon-[solar--restart-linear]", "RotateCcw");
export const Search = icon("icon-[solar--magnifer-linear]", "Search");
export const Send = icon("icon-[solar--plain-linear]", "Send");
export const Settings = icon("icon-[solar--settings-linear]", "Settings");
export const ShieldAlert = icon("icon-[solar--shield-warning-linear]", "ShieldAlert");
export const ShieldCheck = icon("icon-[solar--shield-check-linear]", "ShieldCheck");
export const Sparkles = icon("icon-[solar--magic-stick-3-linear]", "Sparkles");
export const Trash2 = icon("icon-[solar--trash-bin-trash-linear]", "Trash2");
export const Undo2 = icon("icon-[solar--undo-left-round-linear]", "Undo2");
export const Upload = icon("icon-[solar--upload-minimalistic-linear]", "Upload");
export const UploadCloud = icon("icon-[solar--cloud-upload-linear]", "UploadCloud");
export const UserRoundCog = icon("icon-[solar--user-id-linear]", "UserRoundCog");
export const Users = icon("icon-[solar--users-group-rounded-linear]", "Users");
export const Wallet = icon("icon-[solar--wallet-money-linear]", "Wallet");
export const X = icon("icon-[solar--close-circle-linear]", "X");
