import { useState } from "react";
import { toggleAthleteFollow } from "@/lib/api";
import { getAthlete } from "@/lib/mock-data";

export function FollowButton({ id, onChange }: { id: string; onChange?: () => void }) {
  const [following, setFollowing] = useState(Boolean(getAthlete(id).isFollowing));
  const [saving, setSaving] = useState(false);

  return (
    <button
      type="button"
      disabled={saving}
      onClick={async () => {
        setSaving(true);
        try {
          const result = await toggleAthleteFollow(id);
          setFollowing(result.following);
          onChange?.();
        } finally {
          setSaving(false);
        }
      }}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${
        following
          ? "border-secondary bg-secondary text-secondary-foreground hover:opacity-90"
          : "border-border hover:bg-muted"
      }`}
    >
      {saving ? "Saving…" : following ? "Following" : "Follow"}
    </button>
  );
}
