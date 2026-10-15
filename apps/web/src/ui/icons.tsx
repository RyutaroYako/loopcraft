import type { JSX } from "@solidjs/web";

function Icon(props: { children: JSX.Element }) {
  return (
    <svg
      class="icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

export const UndoIcon = () => (
  <Icon>
    <path d="M7.5 5 4 8.5 7.5 12" />
    <path d="M4 8.5h8a4 4 0 0 1 0 8H9.5" />
  </Icon>
);

export const RedoIcon = () => (
  <Icon>
    <path d="M12.5 5 16 8.5 12.5 12" />
    <path d="M16 8.5H8a4 4 0 0 0 0 8h2.5" />
  </Icon>
);

export const FileIcon = () => (
  <Icon>
    <path d="M11.5 2.75H6a1.25 1.25 0 0 0-1.25 1.25v12A1.25 1.25 0 0 0 6 17.25h8A1.25 1.25 0 0 0 15.25 16V6.5z" />
    <path d="M11.5 2.75V6.5h3.75" />
  </Icon>
);

export const OpenIcon = () => (
  <Icon>
    <path d="M10 12.5V3" />
    <path d="m6.5 6.5 3.5-3.5 3.5 3.5" />
    <path d="M3.5 12.5v2.75c0 .7.55 1.25 1.25 1.25h10.5c.7 0 1.25-.55 1.25-1.25V12.5" />
  </Icon>
);

export const SaveIcon = () => (
  <Icon>
    <path d="M10 3v9.5" />
    <path d="m6.5 9 3.5 3.5L13.5 9" />
    <path d="M3.5 12.5v2.75c0 .7.55 1.25 1.25 1.25h10.5c.7 0 1.25-.55 1.25-1.25V12.5" />
  </Icon>
);

export const LayoutIcon = () => (
  <Icon>
    <circle cx="10" cy="4.5" r="2" />
    <circle cx="4.5" cy="15" r="2" />
    <circle cx="15.5" cy="15" r="2" />
    <path d="M9 6.3 5.5 13.2M11 6.3l3.5 6.9M6.5 15h7" />
  </Icon>
);

export const ImageIcon = () => (
  <Icon>
    <rect x="3" y="3.75" width="14" height="12.5" rx="1.75" />
    <circle cx="7.25" cy="8" r="1.25" />
    <path d="m3.5 14.25 4-4 3 3 2-2 4 4" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon>
    <rect x="7" y="7" width="9.25" height="9.25" rx="1.5" />
    <path d="M13 7V5.25c0-.83-.67-1.5-1.5-1.5H5.25c-.83 0-1.5.67-1.5 1.5v6.25c0 .83.67 1.5 1.5 1.5H7" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M10 4.5v11M4.5 10h11" />
  </Icon>
);

export const MinusIcon = () => (
  <Icon>
    <path d="M4.5 10h11" />
  </Icon>
);

export const FitIcon = () => (
  <Icon>
    <path d="M3.5 7V4.75c0-.7.55-1.25 1.25-1.25H7M13 3.5h2.25c.7 0 1.25.55 1.25 1.25V7M16.5 13v2.25c0 .7-.55 1.25-1.25 1.25H13M7 16.5H4.75c-.7 0-1.25-.55-1.25-1.25V13" />
    <rect x="7" y="7" width="6" height="6" rx="1" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
    <path d="M5 5.5 5.75 16a1.25 1.25 0 0 0 1.25 1.15h6a1.25 1.25 0 0 0 1.25-1.15L15 5.5" />
  </Icon>
);

export const PinIcon = (props: { filled?: boolean }) => (
  <Icon>
    <path
      d="M10 2.75 12.2 7.2l4.9.7-3.55 3.45.85 4.9L10 13.95 5.6 16.25l.85-4.9L2.9 7.9l4.9-.7z"
      fill={props.filled ? "currentColor" : "none"}
    />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="m5 5 10 10M15 5 5 15" />
  </Icon>
);

export const LockIcon = () => (
  <Icon>
    <rect x="4.5" y="9" width="11" height="8" rx="1.75" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </Icon>
);

export const SparkIcon = () => (
  <Icon>
    <path d="M10 3v3M10 14v3M3 10h3M14 10h3M5.05 5.05l2.1 2.1M12.85 12.85l2.1 2.1M5.05 14.95l2.1-2.1M12.85 7.15l2.1-2.1" />
  </Icon>
);

export const ArrowRightIcon = () => (
  <Icon>
    <path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" />
  </Icon>
);

export const LogoMark = () => (
  <svg class="logo-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M6.2 8.4a7 7 0 0 1 12.3 1.1"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
    />
    <path
      d="m19.4 6.4-.6 3.6-3.5-1"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M17.8 15.6a7 7 0 0 1-12.3-1.1"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
    />
    <path
      d="m4.6 17.6.6-3.6 3.5 1"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);
