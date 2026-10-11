import type { JSX } from "@solidjs/web";

/** 線幅 1.5 で揃えた 20px グリッドのアイコン */
function Icon(props: { children: JSX.Element; label?: string }) {
  return (
    <svg
      class="icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={props.label ? undefined : "true"}
      role={props.label ? "img" : undefined}
      aria-label={props.label}
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

/** 因果ループを表すロゴマーク */
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
