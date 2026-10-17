import type { Ref } from "vue";
import { ref, shallowRef } from "vue";

export interface Notice {
  tone: "error" | "info";
  title: string;
  details?: string[];
  actions?: { label: string; run: () => void }[];
}

export function useNotices() {
  // shallowRef にするのは、dismiss(only) で渡されたお知らせと === で比べるため。深い ref だと中身がプロキシに替わる
  const notice = shallowRef<Notice | null>(null);
  // お知らせそのものを key にしないのは、key に渡せるのが文字列・数・symbol だけのため
  const key = ref(0);

  function notify(next: Notice) {
    // 案内で上書きしないのは、操作を求めるエラーをすぐ消える案内で押し流さないため
    const shown = notice.value;
    if (next.tone === "info" && shown?.tone === "error" && shown.actions?.length) return;
    notice.value = next;
    key.value++;
  }

  /** only を渡すのは、閉じるまでに別のお知らせへ替わっていたら、それを閉じないため */
  function dismiss(only?: Notice) {
    if (only !== undefined && notice.value !== only) return;
    notice.value = null;
  }

  return {
    notice: notice as Readonly<Ref<Notice | null>>,
    key: key as Readonly<Ref<number>>,
    notify,
    dismiss,
  };
}
