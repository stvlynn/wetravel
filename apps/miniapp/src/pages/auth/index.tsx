import { useEffect, useRef, useState } from "react";
import { Button, Form, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  signInWithEmail,
  signInWithWechat,
  updateUserName,
  uploadUserAvatar,
} from "@/shared/api";
import { getAuthToken, setAuthToken } from "@/shared/auth";
import { copy } from "@/shared/config";
import {
  canStartWechatLogin,
  normalizeWechatNickname,
  type NicknameReviewState,
} from "./model/wechat-profile";
import "./page.css";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [wechatNickname, setWechatNickname] = useState("");
  const [avatarChosen, setAvatarChosen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [wechatSubmitting, setWechatSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const wechatStartedRef = useRef(false);
  const nicknameRef = useRef<string | null>(null);
  const avatarPathRef = useRef<string | null>(null);
  const nicknameReviewSupportedRef = useRef(
    Taro.canIUse("input.bindnicknamereview"),
  );
  const nicknameReviewRef = useRef<NicknameReviewState>(
    nicknameReviewSupportedRef.current ? "pending" : "unsupported",
  );

  useEffect(() => {
    if (getAuthToken()) {
      void Taro.reLaunch({ url: "/pages/trips/index" });
    }
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submit = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError(copy.auth.invalidInput);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signInWithEmail(normalizedEmail, password);
      await Taro.reLaunch({ url: "/pages/trips/index" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.common.unknownError);
    } finally {
      setSubmitting(false);
    }
  };

  const submitWechat = async (nickname: string, avatarPath: string) => {
    try {
      const token = await signInWithWechat();
      await updateUserName(nickname, token);
      await uploadUserAvatar(avatarPath, token);
      setAuthToken(token);
      await Taro.reLaunch({ url: "/pages/trips/index" });
    } catch (caught) {
      if (mountedRef.current) {
        setError(caught instanceof Error ? caught.message : copy.auth.wechatError);
      }
    } finally {
      wechatStartedRef.current = false;
      if (mountedRef.current) setWechatSubmitting(false);
    }
  };

  const tryStartWechat = () => {
    if (
      wechatStartedRef.current ||
      !canStartWechatLogin({
        nickname: nicknameRef.current,
        avatarPath: avatarPathRef.current,
        review: nicknameReviewRef.current,
      })
    ) {
      return;
    }

    wechatStartedRef.current = true;
    setWechatSubmitting(true);
    setError(null);
    void submitWechat(nicknameRef.current!, avatarPathRef.current!);
  };

  const submitWechatProfile = (event: {
    detail: { value?: Record<string, unknown> };
  }) => {
    const nickname = normalizeWechatNickname(event.detail.value?.nickname);
    nicknameRef.current = nickname || null;
    if (!nickname) {
      setError(copy.auth.wechatNicknameRequired);
      return;
    }
    tryStartWechat();
  };

  const chooseWechatAvatar = (event: { detail: unknown }) => {
    const detail = event.detail as { avatarUrl?: unknown };
    const avatarPath =
      typeof detail.avatarUrl === "string" ? detail.avatarUrl.trim() : "";
    avatarPathRef.current = avatarPath || null;
    if (!avatarPath) {
      setError(copy.auth.wechatAvatarRequired);
      return;
    }
    // Reveal the nickname step only after the avatar is selected, so the
    // initial screen stays clean with a single WeChat login action.
    setError(null);
    setAvatarChosen(true);
    tryStartWechat();
  };

  const reviewWechatNickname = (event: { detail: unknown }) => {
    const detail = event.detail as { pass?: unknown };
    nicknameReviewRef.current = detail.pass === true ? "passed" : "failed";
    if (detail.pass !== true) {
      nicknameRef.current = null;
      setWechatNickname("");
      setError(copy.auth.wechatNicknameRejected);
      return;
    }
    tryStartWechat();
  };

  return (
    <View className="page-shell auth-page">
      <View className="auth-brand">
        <View className="auth-brand__mark" />
        <Text className="auth-brand__name">OpenTrip</Text>
      </View>

      <View className="card auth-card">
        <Text className="auth-card__title">{copy.auth.title}</Text>
        <Text className="auth-card__subtitle">{copy.auth.subtitle}</Text>

        {avatarChosen ? (
          <Form className="wechat-login-form" onSubmit={submitWechatProfile}>
            <View className="auth-field">
              <Text className="auth-field__label">{copy.auth.wechatNickname}</Text>
              <Input
                className="field"
                name="nickname"
                type="nickname"
                maxlength={64}
                focus
                value={wechatNickname}
                placeholder={copy.auth.wechatNicknamePlaceholder}
                disabled={submitting || wechatSubmitting}
                onInput={(event) => {
                  setWechatNickname(event.detail.value);
                  nicknameRef.current = null;
                  if (nicknameReviewSupportedRef.current) {
                    nicknameReviewRef.current = "pending";
                  }
                }}
                onNickNameReview={reviewWechatNickname}
              />
            </View>
            <Button
              className="wechat-button"
              formType="submit"
              loading={wechatSubmitting}
              disabled={submitting || wechatSubmitting}
            >
              {wechatSubmitting ? copy.auth.wechatSubmitting : copy.auth.wechatConfirm}
            </Button>
          </Form>
        ) : (
          <Button
            className="wechat-button"
            openType="chooseAvatar"
            disabled={submitting || wechatSubmitting}
            onChooseAvatar={chooseWechatAvatar}
          >
            <View className="wechat-button__icon" />
            {copy.auth.wechat}
          </Button>
        )}

        <View className="auth-divider">
          <View className="auth-divider__line" />
          <Text className="auth-divider__copy">{copy.auth.divider}</Text>
          <View className="auth-divider__line" />
        </View>

        <View className="auth-field">
          <Text className="auth-field__label">{copy.auth.email}</Text>
          <Input
            className="field"
            type="text"
            value={email}
            placeholder={copy.auth.emailPlaceholder}
            onInput={(event) => setEmail(event.detail.value)}
          />
        </View>

        <View className="auth-field">
          <Text className="auth-field__label">{copy.auth.password}</Text>
          <Input
            className="field"
            password
            value={password}
            placeholder={copy.auth.passwordPlaceholder}
            onInput={(event) => setPassword(event.detail.value)}
          />
        </View>

        {error ? <Text className="error-copy">{error}</Text> : null}

        <Button
          className="primary-button auth-card__submit"
          disabled={submitting || wechatSubmitting}
          onClick={() => void submit()}
        >
          {submitting ? copy.auth.submitting : copy.auth.submit}
        </Button>
      </View>
    </View>
  );
}
