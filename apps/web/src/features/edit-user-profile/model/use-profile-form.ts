import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient, useSession } from "@/shared/auth";
import { deleteAvatarFile, ProfileApiError, uploadAvatarFile } from "../api/avatar";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function useProfileForm() {
  const { t } = useTranslation("common");
  const { data: session, refetch } = useSession();
  const user = session?.user;

  const [displayName, setDisplayName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayName(user?.name?.trim() ?? "");
    setImage(user?.image ?? null);
  }, [user?.name, user?.image]);

  const saveProfile = useCallback(async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError(t("settings.profile.errors.displayNameRequired"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await authClient.updateUser({ name: trimmedName });
      if (result.error) throw result.error;
      await refetch();
    } catch {
      setError(t("settings.profile.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [displayName, refetch, t]);

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (file.size > MAX_AVATAR_BYTES) {
        setError(t("settings.profile.errors.avatarTooLarge"));
        return;
      }
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        setError(t("settings.profile.errors.avatarUnsupported"));
        return;
      }

      setAvatarUploading(true);
      setError(null);
      try {
        const url = await uploadAvatarFile(file);
        setImage(url);
        await refetch();
      } catch (uploadError) {
        setError(t(avatarErrorKey(uploadError, "avatarUploadFailed")));
      } finally {
        setAvatarUploading(false);
      }
    },
    [refetch, t],
  );

  const removeAvatar = useCallback(async () => {
    setAvatarUploading(true);
    setError(null);
    try {
      await deleteAvatarFile();
      setImage(null);
      await refetch();
    } catch (removeError) {
      setError(t(avatarErrorKey(removeError, "avatarRemoveFailed")));
    } finally {
      setAvatarUploading(false);
    }
  }, [refetch, t]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    displayName,
    setDisplayName,
    image,
    saving,
    avatarUploading,
    error,
    fileInputRef,
    saveProfile,
    uploadAvatar,
    removeAvatar,
    openFilePicker,
  };
}

function avatarErrorKey(
  error: unknown,
  fallback: "avatarUploadFailed" | "avatarRemoveFailed",
):
  | "settings.profile.errors.avatarTooLarge"
  | "settings.profile.errors.avatarUnsupported"
  | "settings.profile.errors.avatarUploadFailed"
  | "settings.profile.errors.avatarRemoveFailed" {
  if (error instanceof ProfileApiError) {
    if (error.code === "avatar_too_large") return "settings.profile.errors.avatarTooLarge";
    if (error.code === "avatar_unsupported_mime") {
      return "settings.profile.errors.avatarUnsupported";
    }
  }
  return fallback === "avatarUploadFailed"
    ? "settings.profile.errors.avatarUploadFailed"
    : "settings.profile.errors.avatarRemoveFailed";
}
