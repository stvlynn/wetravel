import { useEffect, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { signInWithEmail, signInWithWechat } from "@/shared/api";
import { getAuthToken } from "@/shared/auth";
import { copy } from "@/shared/config";
import "./page.css";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [wechatSubmitting, setWechatSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getAuthToken()) {
      void Taro.reLaunch({ url: "/pages/trips/index" });
    }
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

  const submitWechat = async () => {
    setWechatSubmitting(true);
    setError(null);
    try {
      await signInWithWechat();
      await Taro.reLaunch({ url: "/pages/trips/index" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.auth.wechatError);
    } finally {
      setWechatSubmitting(false);
    }
  };

  return (
    <View className="page-shell auth-page">
      <View className="auth-brand">
        <View className="auth-brand__mark">O</View>
        <Text className="auth-brand__name">OpenTrip</Text>
      </View>

      <View className="card auth-card">
        <Text className="auth-card__title">{copy.auth.title}</Text>
        <Text className="auth-card__subtitle">{copy.auth.subtitle}</Text>

        <Button
          className="wechat-button"
          disabled={submitting || wechatSubmitting}
          onClick={() => void submitWechat()}
        >
          <Text className="wechat-button__icon">微信</Text>
          {wechatSubmitting ? copy.auth.wechatSubmitting : copy.auth.wechat}
        </Button>

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
