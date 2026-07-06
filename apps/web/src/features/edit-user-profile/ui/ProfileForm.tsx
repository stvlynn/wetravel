import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Avatar } from "@/shared/ui/avatar";
import { avatarHashIndex, AVATAR_PALETTE } from "@/shared/lib";
import { useProfileForm } from "../model/use-profile-form";

export function ProfileForm(): React.ReactElement {
    const { t } = useTranslation("common");
    const {
        displayName,
        setDisplayName,
        image,
        saving,
        avatarUploading,
        fileInputRef,
        saveProfile,
        uploadAvatar,
        removeAvatar,
        openFilePicker,
    } = useProfileForm();

    const seed = displayName || "?";
    const color = AVATAR_PALETTE[avatarHashIndex(seed, AVATAR_PALETTE.length)]!;
    const hasCustomAvatar = Boolean(image);

    return (
        <div className="flex max-w-[520px] flex-col gap-7">
            <div className="flex items-center gap-4">
                <Avatar
                    name={displayName || "?"}
                    bg={color.bg}
                    fg={color.fg}
                    src={image}
                    size={64}
                />
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        disabled={avatarUploading}
                        onClick={openFilePicker}
                    >
                        {t("settings.profile.uploadAvatar")}
                    </Button>
                    {hasCustomAvatar ? (
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={avatarUploading}
                            onClick={() => void removeAvatar()}
                        >
                            {t("settings.profile.removeAvatar")}
                        </Button>
                    ) : null}
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        void uploadAvatar(file);
                    }}
                />
            </div>

            <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-foreground">
                    {t("settings.profile.displayName")}
                </span>
                <Input
                    type="text"
                    value={displayName}
                    maxLength={64}
                    onChange={(event) => setDisplayName(event.target.value)}
                />
            </label>

            <div>
                <Button
                    type="button"
                    variant="primary"
                    disabled={saving || avatarUploading}
                    onClick={() => void saveProfile()}
                >
                    {saving
                        ? t("settings.profile.saving")
                        : t("settings.profile.save")}
                </Button>
            </div>
        </div>
    );
}
