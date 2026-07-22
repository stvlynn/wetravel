import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  Clock3Icon,
  DownloadIcon,
  FileTextIcon,
  MapPinIcon,
  PenLineIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { TripSummary } from "@/entities/trip";
import { cn } from "@/shared/lib";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { TripMapThumbnail } from "@/shared/ui/map";
import type { LocalJournalEntry } from "../model/local-journal";

interface JournalDetailProps {
  entry: LocalJournalEntry;
  trip: TripSummary | undefined;
  locale: string;
  authorName: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

interface ArticleSection {
  id: string;
  title: string;
  level: number;
  markdown: string;
}

function toSections(body: string, fallbackTitle: string): ArticleSection[] {
  const lines = body.split("\n");
  const sections: ArticleSection[] = [];
  let title = fallbackTitle;
  let level = 1;
  let markdown: string[] = [];

  const pushSection = () => {
    const content = markdown.join("\n").trim();
    if (!content && sections.length === 0) return;
    sections.push({
      id: `section-${sections.length + 1}`,
      title,
      level,
      markdown: content,
    });
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,5})\s+(.+)$/);
    if (heading) {
      pushSection();
      level = heading[1]?.length ?? 1;
      title = heading[2] ?? fallbackTitle;
      markdown = [];
      continue;
    }
    markdown.push(line);
  }
  pushSection();

  return sections.length
    ? sections
    : [{ id: "section-1", title: fallbackTitle, level: 1, markdown: body }];
}

function textFromChildren(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return textFromChildren(child.props.children);
      }
      return "";
    })
    .join("");
}

function ArticleHeading({
  level,
  children,
}: {
  level: number;
  children: ReactNode;
}) {
  const className = cn(
    "font-heading font-semibold tracking-tight text-balance",
    level === 1 && "text-3xl",
    level === 2 && "text-2xl",
    level === 3 && "text-xl",
    level === 4 && "text-lg",
    level >= 5 && "text-base",
  );
  if (level <= 1) return <h2 className={className}>{children}</h2>;
  if (level === 2) return <h3 className={className}>{children}</h3>;
  if (level === 3) return <h4 className={className}>{children}</h4>;
  if (level === 4) return <h5 className={className}>{children}</h5>;
  return <h6 className={className}>{children}</h6>;
}

function JournalMapWidget({
  trip,
  label,
  unavailableLabel,
}: {
  trip: TripSummary | undefined;
  label: string;
  unavailableLabel: string;
}) {
  return (
    <figure className="my-7 overflow-hidden rounded-2xl bg-secondary shadow-[var(--shadow-border)] outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10">
      <div className="relative h-52 sm:h-60">
        {trip?.location ? (
          <TripMapThumbnail
            lat={trip.location.lat}
            lng={trip.location.lng}
            markerColor={trip.coverColor}
            attributionClassName="left-auto right-1.5"
          />
        ) : (
          <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <MapPinIcon className="size-4" aria-hidden="true" />
            {unavailableLabel}
          </div>
        )}
        <figcaption className="absolute bottom-3 left-3 rounded-full bg-card/92 px-3 py-1.5 text-xs font-semibold text-card-foreground shadow-sm backdrop-blur-md">
          {trip?.title ?? label}
        </figcaption>
      </div>
    </figure>
  );
}

export function JournalDetail({
  entry,
  trip,
  locale,
  authorName,
  onBack,
  onEdit,
  onDelete,
}: JournalDetailProps) {
  const { t } = useTranslation("trips");
  const { t: tc } = useTranslation("common");
  const sections = useMemo(
    () => toSections(entry.body, t("journal.detail.opening")),
    [entry.body, t],
  );
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const wordCount = entry.body.replace(/\s/g, "").length;
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 350));
  const formattedDate = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(entry.occurredAt));

  useEffect(() => {
    const observer = new IntersectionObserver(
      (records) => {
        const visible = records.find((record) => record.isIntersecting);
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);

  function askArticle(event: FormEvent) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt) return;
    const excerpt = entry.body.replace(/\s+/g, " ").slice(0, 180);
    setAnswer(
      t("journal.detail.aiPreviewAnswer", {
        question: prompt,
        excerpt,
      }),
    );
    setQuestion("");
  }

  return (
    <article className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 md:px-8 md:py-8 md:pb-14">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeftIcon aria-hidden="true" />
          {t("journal.detail.back")}
        </Button>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            <PenLineIcon aria-hidden="true" />
            {t("journal.actions.edit")}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button type="button" variant="ghost" size="sm">
                  <Trash2Icon aria-hidden="true" />
                  {t("journal.actions.delete")}
                </Button>
              }
            />
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("journal.delete.title")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("journal.delete.description")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose render={<Button variant="ghost" />}>
                  {tc("actions.cancel")}
                </AlertDialogClose>
                <AlertDialogClose
                  render={<Button variant="destructive" onClick={onDelete} />}
                >
                  {t("journal.delete.action")}
                </AlertDialogClose>
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
        </div>
      </div>

      <div
        className="relative aspect-[16/9] overflow-hidden rounded-[1.75rem] border border-border bg-secondary md:aspect-[2.25/1]"
        style={{ backgroundColor: trip?.coverColor }}
      >
        {trip?.location ? (
          <div
            className="absolute inset-0"
            role="img"
            aria-label={t("journal.detail.mapCoverAlt", {
              title: trip.title,
            })}
          >
            <TripMapThumbnail
              lat={trip.location.lat}
              lng={trip.location.lng}
              markerColor={trip.coverColor}
              attributionClassName="left-auto right-1.5"
            />
          </div>
        ) : trip?.coverUrl ? (
          <img
            src={trip.coverUrl}
            alt={t("journal.detail.coverAlt", { title: entry.title })}
            className="size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,var(--brand-muted),transparent_40%),linear-gradient(135deg,transparent_20%,var(--secondary)_100%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white md:p-10">
          {trip ? (
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-white/75">
              <MapPinIcon className="size-3.5" aria-hidden="true" />
              {trip.title}
            </p>
          ) : null}
          <h1 className="max-w-3xl font-heading text-3xl font-semibold tracking-[-0.035em] text-balance md:text-5xl">
            {entry.title || t("journal.untitled")}
          </h1>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-5xl">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-7 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{authorName}</span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDaysIcon className="size-4" aria-hidden="true" />
            {formattedDate}
          </span>
          <Badge variant={entry.status === "published" ? "success" : "neutral"}>
            {t(`journal.status.${entry.status}`)}
          </Badge>
          <span className="inline-flex items-center gap-1.5">
            <Clock3Icon className="size-4" aria-hidden="true" />
            {t("journal.detail.readingTime", { count: readingMinutes })}
          </span>
        </div>

        <div className="mt-9 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0">
            <div className="flex flex-col gap-12">
              {sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-20"
                >
                  <ArticleHeading level={section.level}>
                    {section.title}
                  </ArticleHeading>
                  <div className="journal-prose mt-4 min-w-0 text-[1.05rem] leading-8 text-foreground/82">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="my-5 leading-8 text-pretty">{children}</p>,
                        ul: ({ children }) => <ul className="my-5 list-disc space-y-2 pl-6">{children}</ul>,
                        ol: ({ children }) => <ol className="my-5 list-decimal space-y-2 pl-6">{children}</ol>,
                        blockquote: ({ children }) =>
                          textFromChildren(children).includes("[!map]") ? (
                            <JournalMapWidget
                              trip={trip}
                              label={t("journal.detail.mapWidget")}
                              unavailableLabel={t("journal.detail.mapUnavailable")}
                            />
                          ) : (
                            <blockquote className="my-6 border-l-2 border-corn-500 pl-5 text-muted-foreground italic">
                              {children}
                            </blockquote>
                          ),
                        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium text-corn-600 underline underline-offset-4">{children}</a>,
                        img: ({ src, alt }) => <img src={src} alt={alt ?? ""} className="my-7 max-h-[36rem] w-full rounded-2xl object-cover shadow-[var(--shadow-border)]" />,
                        code: ({ children }) => <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>,
                      }}
                    >
                      {section.markdown}
                    </ReactMarkdown>
                  </div>
                </section>
              ))}
            </div>

            {entry.attachments.length ? (
              <section className="mt-12 border-t border-border pt-8">
                <h2 className="font-heading text-lg font-semibold">
                  {t("journal.detail.attachments")}
                </h2>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {entry.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="wf-interactive flex min-h-14 items-center gap-3 rounded-xl bg-secondary px-4 py-3 hover:bg-accent"
                      >
                        <FileTextIcon className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{attachment.name}</span>
                        <DownloadIcon className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="mt-14 rounded-2xl border border-border bg-secondary/55 p-4 md:p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <SparklesIcon className="size-4 text-corn-600" aria-hidden="true" />
                {t("journal.detail.askTitle")}
              </div>
              {answer ? (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {answer}
                </p>
              ) : null}
              <form onSubmit={askArticle} className="mt-4 flex items-center gap-2">
                <Input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={t("journal.detail.askPlaceholder")}
                  className="h-11 flex-1 bg-card"
                />
                <Button
                  type="submit"
                  variant="brand"
                  size="icon"
                  disabled={!question.trim()}
                  aria-label={t("journal.detail.send")}
                >
                  <SendIcon aria-hidden="true" />
                </Button>
              </form>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("journal.detail.aiPreviewNotice")}
              </p>
            </div>
          </div>

          <aside className="hidden lg:block">
            <nav className="sticky top-8" aria-label={t("journal.detail.contents")}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  {t("journal.detail.contents")}
                </p>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
                  {String(sections.findIndex((section) => section.id === activeSection) + 1).padStart(2, "0")} / {String(sections.length).padStart(2, "0")}
                </span>
              </div>
              <ul className="border-l-2 border-border">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className={cn(
                        "block border-l-2 py-2 pr-1 text-sm transition-colors",
                        activeSection === section.id
                          ? "-ml-0.5 border-corn-500 font-medium text-foreground"
                          : "-ml-0.5 border-transparent text-muted-foreground hover:text-foreground",
                      )}
                      style={{ paddingLeft: `${16 + Math.max(0, section.level - 1) * 10}px` }}
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>
      </div>
    </article>
  );
}
