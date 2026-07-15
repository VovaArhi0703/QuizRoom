import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { http } from "../api/http";
import { invalidateCached } from "../api/queryCache";
import answerIcon from "../assets/create_quiz/answer_create_quiz.svg";
import answerOnIcon from "../assets/create_quiz/answer_on_create_quiz.svg";
import arrowDownIcon from "../assets/create_quiz/arrow_down_create_quiz.svg";
import arrowUpIcon from "../assets/create_quiz/arrow_up_create_quiz.svg";
import attentionIcon from "../assets/create_quiz/attention_create_quiz.svg";
import blueCheckIcon from "../assets/create_quiz/blue_galka_create_quiz.svg";
import deleteIcon from "../assets/create_quiz/delete_create_quiz.svg";
import invalidIcon from "../assets/create_quiz/filled_create_quiz.svg";
import checkOffIcon from "../assets/create_quiz/galka_off_create_quiz.svg";
import greenCheckIcon from "../assets/create_quiz/green_galka_create_quiz.svg";
import imageAddIcon from "../assets/create_quiz/image_add_create_quiz.svg";
import multipleIcon from "../assets/create_quiz/multiple_choice_create_quiz.svg";
import multipleOnIcon from "../assets/create_quiz/multiple_choice_on_create_quiz.svg";
import orangeCheckIcon from "../assets/create_quiz/orange_galka_create_quiz.svg";
import plusBigIcon from "../assets/create_quiz/plus_big_create_quiz.svg";
import plusIcon from "../assets/create_quiz/plus_create_quiz.svg";
import purpleCheckIcon from "../assets/create_quiz/purple_galka_create_quiz.svg";
import redCheckIcon from "../assets/create_quiz/red_galka_create_quiz.svg";
import studentIcon from "../assets/create_quiz/student_create_quiz.svg";
import { resolveUploadUrl } from "../utils/uploads";

const tagColors = [
  { id: "green", label: "Зелёный", background: "#F1F9C6", text: "#28AB3C", checkIcon: greenCheckIcon },
  { id: "purple", label: "Фиолетовый", background: "#E3E0FD", text: "#5849E1", checkIcon: purpleCheckIcon },
  { id: "blue", label: "Синий", background: "#E7F0FB", text: "#3C8AFF", checkIcon: blueCheckIcon },
  { id: "orange", label: "Оранжевый", background: "#FCF0D3", text: "#F49907", checkIcon: orangeCheckIcon },
  { id: "red", label: "Красный", background: "#EBCECD", text: "#BD4243", checkIcon: redCheckIcon },
];

function createEmptyOption(isCorrect = false) {
  return {
    clientId: crypto.randomUUID(),
    text: "",
    imageUrl: "",
    imagePreview: "",
    imageFile: null,
    isCorrect,
  };
}

function createEmptyQuestion() {
  return {
    clientId: crypto.randomUUID(),
    text: "",
    imageUrl: "",
    imagePreview: "",
    imageFile: null,
    type: "SINGLE",
    timeLimit: 0,
    options: [createEmptyOption(true)],
  };
}

function formatTime(totalSeconds) {
  const value = Math.max(0, Number(totalSeconds) || 0);
  const minutes = String(Math.floor(value / 60)).padStart(2, "0");
  const seconds = String(value % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function getTimeDigits(totalSeconds) {
  return formatTime(totalSeconds).replace(":", "");
}

function parseTimeDigits(value, fallbackSeconds) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 4);

  if (!digits) {
    return fallbackSeconds;
  }

  const padded = digits.padStart(4, "0");
  const minutes = Number(padded.slice(0, 2)) || 0;
  const seconds = Math.min(Number(padded.slice(2, 4)) || 0, 59);

  return minutes * 60 + seconds;
}

function categoryToTags(category) {
  return String(category || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((label, index) => ({ id: crypto.randomUUID(), label, color: tagColors[index % tagColors.length].id }));
}

function tagsToCategory(tags) {
  return tags.map((tag) => tag.label.trim()).filter(Boolean).join(", ");
}

function getQuizDraftSignature(quizForm, tags, questions, deletedQuestionIds) {
  return JSON.stringify({
    title: quizForm.title.trim(),
    timeLimit: Number(quizForm.timeLimit) || 0,
    tags: tags
      .filter((tag) => tag.label.trim())
      .map((tag) => ({ label: tag.label.trim(), color: tag.color })),
    deletedQuestionIds: [...deletedQuestionIds].sort(),
    questions: questions.map((question) => ({
      id: question.id || "",
      text: question.text.trim(),
      imageUrl: question.imageUrl || "",
      imageFile: question.imageFile?.name || "",
      type: question.type,
      timeLimit: Number(question.timeLimit) || 0,
      options: question.options.map((option) => ({
        id: option.id || "",
        text: option.text.trim(),
        imageUrl: option.imageUrl || "",
        imageFile: option.imageFile?.name || "",
        isCorrect: Boolean(option.isCorrect),
      })),
    })),
  });
}

function normalizeQuestion(question) {
  return {
    ...question,
    clientId: question.id || crypto.randomUUID(),
    imagePreview: "",
    imageFile: null,
    options: question.options.map((option) => ({
      ...option,
      clientId: option.id || crypto.randomUUID(),
      imagePreview: "",
      imageFile: null,
    })),
  };
}

function isQuestionComplete(question) {
  const filledOptions = question.options.filter((option) => option.text.trim());

  return (
    Boolean(question.text.trim()) &&
    Number(question.timeLimit) > 0 &&
    filledOptions.length >= 2 &&
    filledOptions.some((option) => option.isCorrect)
  );
}

function isAnswersComplete(question) {
  const filledOptions = question.options.filter((option) => option.text.trim());

  return filledOptions.length >= 2 && filledOptions.some((option) => option.isCorrect);
}

export function QuizEditorPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const isNew = !quizId;
  const fileInputsRef = useRef(new Map());
  const [quiz, setQuiz] = useState(null);
  const [quizForm, setQuizForm] = useState({
    title: "",
    timeLimit: 120,
    status: "DRAFT",
  });
  const [tags, setTags] = useState([]);
  const [selectedTagColor, setSelectedTagColor] = useState("green");
  const [editingTagId, setEditingTagId] = useState("");
  const [questions, setQuestions] = useState([createEmptyQuestion()]);
  const [deletedQuestionIds, setDeletedQuestionIds] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState("");
  const [savedSignature, setSavedSignature] = useState(() =>
    getQuizDraftSignature({ title: "", timeLimit: 120, status: "DRAFT" }, [], [createEmptyQuestion()], []),
  );

  const titleFilled = Boolean(quizForm.title.trim());
  const tagsFilled = tags.some((tag) => tag.label.trim());
  const completeQuestionsCount = questions.filter(isQuestionComplete).length;
  const draftSignature = useMemo(
    () => getQuizDraftSignature(quizForm, tags, questions, deletedQuestionIds),
    [deletedQuestionIds, questions, quizForm, tags],
  );
  const hasChanges = draftSignature !== savedSignature;
  const canSave = titleFilled && completeQuestionsCount > 0 && hasChanges;

  useEffect(() => {
    if (!hasChanges) {
      return undefined;
    }

    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  useEffect(() => {
    if (!hasChanges) {
      return undefined;
    }

    function handleDocumentClick(event) {
      const anchor = event.target.closest?.("a[href]");

      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const url = new URL(anchor.href);
      const currentUrl = new URL(window.location.href);

      if (
        anchor.target ||
        anchor.hasAttribute("download") ||
        url.origin !== currentUrl.origin ||
        `${url.pathname}${url.search}${url.hash}` === `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
      ) {
        return;
      }

      event.preventDefault();
      setPendingNavigation(`${url.pathname}${url.search}${url.hash}`);
    }

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [hasChanges]);

  useEffect(() => {
    if (isNew) {
      return;
    }

    async function loadQuiz() {
      try {
        const { data } = await http.get(`/quizzes/${quizId}`);
        const loadedForm = {
          title: data.quiz.title,
          timeLimit: data.quiz.timeLimit,
          status: data.quiz.status,
        };
        const loadedTags = categoryToTags(data.quiz.category);
        const loadedQuestions = data.quiz.questions.length ? data.quiz.questions.map(normalizeQuestion) : [createEmptyQuestion()];

        setQuiz(data.quiz);
        setQuizForm(loadedForm);
        setTags(loadedTags);
        setQuestions(loadedQuestions);
        setSavedSignature(getQuizDraftSignature(loadedForm, loadedTags, loadedQuestions, []));
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    loadQuiz();
  }, [isNew, quizId]);

  function setQuestion(questionIndex, patch) {
    setQuestions((current) =>
      current.map((question, index) => (index === questionIndex ? { ...question, ...patch } : question)),
    );
    setStatus("");
  }

  function setOption(questionIndex, optionIndex, patch) {
    setQuestions((current) =>
      current.map((question, index) => {
        if (index !== questionIndex) {
          return question;
        }

        return {
          ...question,
          options: question.options.map((option, currentOptionIndex) =>
            currentOptionIndex === optionIndex ? { ...option, ...patch } : option,
          ),
        };
      }),
    );
    setStatus("");
  }

  function moveQuestion(questionIndex, direction) {
    const nextIndex = questionIndex + direction;

    if (nextIndex < 0 || nextIndex >= questions.length) {
      return;
    }

    setQuestions((current) => {
      const next = [...current];
      [next[questionIndex], next[nextIndex]] = [next[nextIndex], next[questionIndex]];
      return next;
    });
  }

  function moveOption(questionIndex, optionIndex, direction) {
    setQuestions((current) =>
      current.map((question, index) => {
        if (index !== questionIndex) {
          return question;
        }

        const nextIndex = optionIndex + direction;

        if (nextIndex < 0 || nextIndex >= question.options.length) {
          return question;
        }

        const options = [...question.options];
        [options[optionIndex], options[nextIndex]] = [options[nextIndex], options[optionIndex]];

        return { ...question, options };
      }),
    );
  }

  function startNewTag() {
    if (editingTagId) {
      const editingTag = tags.find((tag) => tag.id === editingTagId);

      if (editingTag && !editingTag.label.trim()) {
        return;
      }
    }

    const id = crypto.randomUUID();

    setTags((current) => [
      ...current.filter((tag) => tag.id !== editingTagId || tag.label.trim()),
      { id, label: "", color: "green" },
    ]);
    setSelectedTagColor("green");
    setEditingTagId(id);
  }

  function startEditingTag(tag) {
    setTags((current) => current.filter((item) => item.id === tag.id || item.label.trim()));
    setSelectedTagColor(tag.color);
    setEditingTagId(tag.id);
  }

  function finishTagEditing() {
    setTags((current) => current.filter((tag) => tag.id !== editingTagId || tag.label.trim()));
    setEditingTagId("");
    setSelectedTagColor("green");
  }

  function updateEditingTagLabel(tagId, label) {
    setTags((current) => current.map((tag) => (tag.id === tagId ? { ...tag, label } : tag)));
  }

  function updateTagColor(colorId) {
    setSelectedTagColor(colorId);

    if (editingTagId) {
      setTags((current) => current.map((tag) => (tag.id === editingTagId ? { ...tag, color: colorId } : tag)));
    }
  }

  function deleteEditingTag() {
    if (!editingTagId) {
      return;
    }

    setTags((current) => current.filter((tag) => tag.id !== editingTagId));
    setEditingTagId("");
    setSelectedTagColor("green");
  }

  function chooseAnswer(questionIndex, optionIndex) {
    setQuestions((current) =>
      current.map((question, index) => {
        if (index !== questionIndex) {
          return question;
        }

        if (question.type === "SINGLE") {
          return {
            ...question,
            options: question.options.map((option, currentIndex) => ({
              ...option,
              isCorrect: currentIndex === optionIndex,
            })),
          };
        }

        return {
          ...question,
          options: question.options.map((option, currentIndex) =>
            currentIndex === optionIndex ? { ...option, isCorrect: !option.isCorrect } : option,
          ),
        };
      }),
    );
  }

  function changeQuestionType(questionIndex, type) {
    setQuestions((current) =>
      current.map((question, index) => {
        if (index !== questionIndex) {
          return question;
        }

        if (type === "SINGLE") {
          let hasCorrect = false;
          return {
            ...question,
            type,
            options: question.options.map((option) => {
              const isCorrect = option.isCorrect && !hasCorrect;
              hasCorrect = hasCorrect || isCorrect;
              return { ...option, isCorrect };
            }),
          };
        }

        return { ...question, type };
      }),
    );
  }

  function deleteQuestion(questionIndex) {
    setQuestions((current) => {
      const question = current[questionIndex];

      if (question?.id) {
        setDeletedQuestionIds((ids) => [...ids, question.id]);
      }

      const next = current.filter((_, index) => index !== questionIndex);
      return next.length ? next : [createEmptyQuestion()];
    });
  }

  function addQuestion() {
    setQuestions((current) => [...current, createEmptyQuestion()]);
  }

  function triggerFileInput(key) {
    fileInputsRef.current.get(key)?.click();
  }

  function setFileInputRef(key, node) {
    if (node) {
      fileInputsRef.current.set(key, node);
    } else {
      fileInputsRef.current.delete(key);
    }
  }

  function attachQuestionImage(questionIndex, file) {
    if (!file) {
      return;
    }

    setQuestion(questionIndex, {
      imageFile: file,
      imagePreview: URL.createObjectURL(file),
    });
  }

  function attachOptionImage(questionIndex, optionIndex, file) {
    if (!file) {
      return;
    }

    setOption(questionIndex, optionIndex, {
      imageFile: file,
      imagePreview: URL.createObjectURL(file),
    });
  }

  async function uploadImage(file) {
    const formData = new FormData();
    formData.append("image", file);

    const { data } = await http.post("/uploads/question-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return data.imageUrl;
  }

  async function saveQuiz() {
    setError("");
    setStatus("");

    if (!canSave) {
      setError("Заполните название квиза и минимум один вопрос с двумя ответами и верным вариантом.");
      return false;
    }

    setIsSaving(true);
    const uploadedImageUrls = [];
    const uploadTasks = [];
    let quizWasPersisted = false;

    try {
      const uploadTrackedImage = (file) => {
        const task = uploadImage(file).then((imageUrl) => {
          uploadedImageUrls.push(imageUrl);
          return imageUrl;
        });
        uploadTasks.push(task);
        return task;
      };
      const payload = {
        title: quizForm.title.trim(),
        description: "",
        category: tagsToCategory(tags),
        timeLimit: Number(quizForm.timeLimit) || 120,
        status: "PUBLISHED",
      };
      const completeQuestions = questions.filter(isQuestionComplete);
      const savedQuestionPayloads = await Promise.all(
        completeQuestions.map(async (question, index) => {
          const filledOptions = question.options.filter((item) => item.text.trim());
          const [imageUrl, optionImageUrls] = await Promise.all([
            question.imageFile ? uploadTrackedImage(question.imageFile) : Promise.resolve(question.imageUrl || null),
            Promise.all(
              filledOptions.map((option) =>
                option.imageFile ? uploadTrackedImage(option.imageFile) : Promise.resolve(option.imageUrl || null),
              ),
            ),
          ]);

          return {
            id: question.id || undefined,
            text: question.text.trim(),
            imageUrl,
            type: question.type,
            timeLimit: Number(question.timeLimit) || 120,
            order: index + 1,
            options: filledOptions.map((option, optionIndex) => ({
              text: option.text.trim(),
              imageUrl: optionImageUrls[optionIndex],
              isCorrect: option.isCorrect,
            })),
          };
        }),
      );
      const { data } = await http.post("/quizzes/save", {
        id: quiz?.id || undefined,
        quiz: payload,
        questions: savedQuestionPayloads,
      });
      quizWasPersisted = true;

      if (!quiz?.id) {
        navigate(`/quizzes/${data.quiz.id}/edit`, { replace: true });
      }

      const savedForm = {
        title: data.quiz.title,
        timeLimit: data.quiz.timeLimit,
        status: data.quiz.status,
      };
      const savedTags = categoryToTags(data.quiz.category);
      const savedQuestions = [...data.quiz.questions.map(normalizeQuestion), createEmptyQuestion()];

      setQuiz(data.quiz);
      setQuizForm(savedForm);
      setTags(savedTags);
      setDeletedQuestionIds([]);
      setQuestions(savedQuestions);
      setSavedSignature(getQuizDraftSignature(savedForm, savedTags, savedQuestions, []));
      invalidateCached("/quizzes");
      invalidateCached("/profile/history");
      setStatus("Квиз сохранён");
      return true;
    } catch (requestError) {
      if (!quizWasPersisted && uploadTasks.length > 0) {
        await Promise.allSettled(uploadTasks);
        await Promise.allSettled(
          uploadedImageUrls.map((imageUrl) =>
            http.delete("/uploads/image", { data: { imageUrl } }),
          ),
        );
      }
      setError(requestError.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAndContinueNavigation() {
    const destination = pendingNavigation;
    const saved = await saveQuiz();

    if (saved && destination) {
      setPendingNavigation("");
      navigate(destination);
    }
  }

  function continueWithoutSaving() {
    const destination = pendingNavigation;
    setPendingNavigation("");

    if (destination) {
      navigate(destination);
    }
  }

  async function deleteQuiz() {
    if (!quiz?.id) {
      navigate("/quizzes");
      return;
    }

    const confirmed = window.confirm("Удалить квиз полностью?");

    if (!confirmed) {
      return;
    }

    try {
      await http.delete(`/quizzes/${quiz.id}`);
      invalidateCached("/quizzes");
      invalidateCached("/profile/history");
      navigate("/quizzes");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const tagColorById = useMemo(
    () => Object.fromEntries(tagColors.map((color) => [color.id, color])),
    [],
  );

  return (
    <section className="create-quiz-screen">
      {error ? <p className="create-quiz-message create-quiz-message-error">{error}</p> : null}
      {status ? <p className="create-quiz-message create-quiz-message-success">{status}</p> : null}

      <article className="cq-card cq-room-card">
        <div className="cq-room-main">
          <FieldHeader label="Напишите название комнаты:" valid={titleFilled} />
          <AutoResizeTextarea
            className="cq-title-input"
            value={quizForm.title}
            placeholder="Название комнаты:"
            minHeight={83}
            onChange={(event) => {
              setQuizForm((current) => ({ ...current, title: event.target.value }));
              setStatus("");
            }}
          />
        </div>

        <div className="cq-tags-block">
          <div className="cq-tag-heading">
            <div className="cq-tag-title-stack">
              <span>Добавить тег:</span>
              <div className="cq-hint">
                <img src={attentionIcon} alt="" />
                <span>Например: История</span>
              </div>
            </div>
            <img className="cq-tag-status" src={tagsFilled ? blueCheckIcon : invalidIcon} alt="" />
          </div>

          <div
            className="cq-tag-editor"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                finishTagEditing();
              }
            }}
          >
            <div className="cq-tags-row">
              {tags.map((tag) => {
                const color = tagColorById[tag.color] || tagColors[1];

                if (editingTagId === tag.id) {
                  return (
                    <div
                      className="cq-tag-chip cq-tag-chip-editing"
                      key={tag.id}
                      style={{ "--tag-bg": color.background, "--tag-color": color.text }}
                    >
                      <input
                        className="cq-tag-chip-input"
                        value={tag.label}
                        style={{ width: `${Math.max(38, Math.min(240, (tag.label.length || 3) * 14))}px` }}
                        autoFocus
                        onChange={(event) => updateEditingTagLabel(tag.id, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            finishTagEditing();
                          }
                        }}
                      />
                    </div>
                  );
                }

                return (
                  <button
                    className="cq-tag-chip"
                    key={tag.id}
                    style={{ "--tag-bg": color.background, "--tag-color": color.text }}
                    type="button"
                    onClick={() => startEditingTag(tag)}
                  >
                    {tag.label}
                  </button>
                );
              })}

              <button className="cq-icon-button cq-tag-add-button" type="button" onClick={startNewTag}>
                <img src={plusIcon} alt="" />
              </button>

              {editingTagId ? (
                <div className="cq-color-tools">
                  {tagColors.map((color) => (
                    <button
                      className="cq-color-swatch"
                      key={color.id}
                      style={{ "--swatch-bg": color.background, "--swatch-border": color.text }}
                      type="button"
                      aria-label={color.label}
                      onClick={() => updateTagColor(color.id)}
                    >
                      {selectedTagColor === color.id ? <img src={color.checkIcon} alt="" /> : null}
                    </button>
                  ))}
                  {editingTagId ? (
                    <button className="cq-icon-button cq-tag-delete-button" type="button" onClick={deleteEditingTag}>
                      <img src={deleteIcon} alt="" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className={`cq-room-actions ${titleFilled ? "has-delete" : ""}`}>
          <button
            className={`cq-action-button cq-save-button ${canSave ? "is-ready" : "is-disabled"}`}
            type="button"
            disabled={isSaving || !canSave}
            onClick={saveQuiz}
          >
            <span>{isSaving ? "Сохраняем..." : "Сохранить созданный квиз"}</span>
            <img src={canSave ? blueCheckIcon : checkOffIcon} alt="" />
          </button>
          {titleFilled ? (
            <button className="cq-action-button cq-delete-button" type="button" onClick={deleteQuiz}>
              <span>Удалить квиз</span>
              <img src={deleteIcon} alt="" />
            </button>
          ) : null}
        </div>
      </article>

      {questions.map((question, questionIndex) => (
        <QuestionBlock
          key={question.clientId}
          attachOptionImage={attachOptionImage}
          attachQuestionImage={attachQuestionImage}
          addQuestion={addQuestion}
          changeQuestionType={changeQuestionType}
          chooseAnswer={chooseAnswer}
          deleteQuestion={deleteQuestion}
          moveOption={moveOption}
          moveQuestion={moveQuestion}
          question={question}
          questionIndex={questionIndex}
          questionsCount={questions.length}
          isLastQuestion={questionIndex === questions.length - 1}
          setFileInputRef={setFileInputRef}
          setOption={setOption}
          setQuestion={setQuestion}
          triggerFileInput={triggerFileInput}
        />
      ))}

      {pendingNavigation ? (
        <div className="cq-unsaved-backdrop" role="presentation">
          <div className="cq-unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="cq-unsaved-title">
            <h2 id="cq-unsaved-title">Есть несохранённые изменения</h2>
            <p>Сохраните квиз перед переходом, чтобы не потерять последние правки.</p>
            <div className="cq-unsaved-actions">
              <button
                className="cq-action-button cq-save-button is-ready"
                type="button"
                disabled={!canSave || isSaving}
                onClick={saveAndContinueNavigation}
              >
                <span>{isSaving ? "Сохраняем..." : "Сохранить"}</span>
                <img src={blueCheckIcon} alt="" />
              </button>
              <button className="cq-action-button cq-neutral-button" type="button" onClick={continueWithoutSaving}>
                <span>Уйти без сохранения</span>
              </button>
              <button className="cq-action-button cq-neutral-button" type="button" onClick={() => setPendingNavigation("")}>
                <span>Остаться</span>
              </button>
            </div>
            {!canSave ? (
              <p className="cq-unsaved-hint">Чтобы сохранить, заполните название и минимум один полноценный вопрос.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FieldHeader({ label, valid }) {
  return (
    <div className="cq-field-header">
      <span>{label}</span>
      <img src={valid ? blueCheckIcon : invalidIcon} alt="" />
    </div>
  );
}

function AutoResizeTextarea({ className, value, onChange, placeholder, minHeight }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = `${minHeight}px`;

    if (textarea.scrollHeight > minHeight + 1) {
      textarea.style.height = `${textarea.scrollHeight}px`;
    } else {
      textarea.style.height = "";
    }
  }, [minHeight, value]);

  return (
    <textarea
      ref={textareaRef}
      className={className}
      value={value}
      placeholder={placeholder}
      rows={1}
      onChange={onChange}
    />
  );
}

function TimeInput({ value, onChange }) {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const isEditing = draft !== null;
  const rawDigits = isEditing ? draft : getTimeDigits(value);
  const digits = [rawDigits[0] || "", rawDigits[1] || "", rawDigits[2] || "", rawDigits[3] || ""];
  const cursorIndex = isEditing ? rawDigits.length : -1;

  function focusInput() {
    if (!isEditing) {
      setDraft("");
    }

    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function commitDraft() {
    if (!isEditing) {
      return;
    }

    if (draft) {
      onChange(parseTimeDigits(draft, value));
    }

    setDraft(null);
  }

  function renderCursor(position) {
    return cursorIndex === position ? <span className="cq-time-cursor" aria-hidden="true" /> : null;
  }

  return (
    <div
      className={`cq-time-input cq-time-control ${isEditing ? "is-editing" : ""}`}
      role="button"
      tabIndex={-1}
      onMouseDown={(event) => {
        event.preventDefault();
        focusInput();
      }}
    >
      <input
        ref={inputRef}
        className="cq-time-hidden-input"
        value={isEditing ? draft : ""}
        inputMode="numeric"
        maxLength={4}
        aria-label="Время на ответ"
        onFocus={() => {
          if (!isEditing) {
            setDraft("");
          }
        }}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 4))}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }

          if (event.key === "Escape") {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
      />
      <span className="cq-time-display" aria-hidden="true">
        {renderCursor(0)}
        <span className="cq-time-digit">{digits[0]}</span>
        {renderCursor(1)}
        <span className="cq-time-digit">{digits[1]}</span>
        {renderCursor(2)}
        <span className="cq-time-colon">:</span>
        <span className="cq-time-digit">{digits[2]}</span>
        {renderCursor(3)}
        <span className="cq-time-digit">{digits[3]}</span>
        {renderCursor(4)}
      </span>
    </div>
  );
}

function QuestionBlock({
  attachOptionImage,
  attachQuestionImage,
  addQuestion,
  changeQuestionType,
  chooseAnswer,
  deleteQuestion,
  moveOption,
  moveQuestion,
  question,
  questionIndex,
  questionsCount,
  isLastQuestion,
  setFileInputRef,
  setOption,
  setQuestion,
  triggerFileInput,
}) {
  const complete = isQuestionComplete(question);
  const answersComplete = isAnswersComplete(question);
  const questionImage = resolveUploadUrl(question.imagePreview || question.imageUrl);

  function deleteOption(optionIndex) {
    const nextOptions = question.options.filter((_, index) => index !== optionIndex);

    setQuestion(questionIndex, {
      options: nextOptions.length ? nextOptions : [createEmptyOption(true)],
    });
  }

  return (
    <article className={questionImage ? "cq-card cq-question-card has-question-image" : "cq-card cq-question-card"}>
      <div className="cq-question-top">
        <div className="cq-question-title">
          <img src={studentIcon} alt="" />
          <h2>Вопрос {questionIndex + 1}</h2>
        </div>
        <div className="cq-reorder-buttons">
          <button type="button" disabled={questionIndex === 0} onClick={() => moveQuestion(questionIndex, -1)}>
            <img src={arrowUpIcon} alt="" />
          </button>
          <button
            type="button"
            disabled={questionIndex === questionsCount - 1}
            onClick={() => moveQuestion(questionIndex, 1)}
          >
            <img src={arrowDownIcon} alt="" />
          </button>
        </div>
      </div>

      <div className="cq-question-text-block">
        <FieldHeader label="Напишите вопрос:" valid={Boolean(question.text.trim())} />
        <AutoResizeTextarea
          className="cq-question-input"
          value={question.text}
          placeholder="Напишите вопрос:"
          minHeight={69}
          onChange={(event) => setQuestion(questionIndex, { text: event.target.value })}
        />
      </div>

      <div className="cq-question-settings">
        <div className="cq-question-control-stack">
          <button className="cq-photo-button" type="button" onClick={() => triggerFileInput(`${question.clientId}:image`)}>
            <span>Добавить фото к вопросу</span>
            <img src={imageAddIcon} alt="" />
          </button>
          <input
            ref={(node) => setFileInputRef(`${question.clientId}:image`, node)}
            className="cq-hidden-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              attachQuestionImage(questionIndex, event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <div className="cq-choice-switch">
            <button
              className={question.type === "SINGLE" ? "active" : ""}
              type="button"
              onClick={() => changeQuestionType(questionIndex, "SINGLE")}
            >
              Одиночный выбор
            </button>
            <button
              className={question.type === "MULTIPLE" ? "active" : ""}
              type="button"
              onClick={() => changeQuestionType(questionIndex, "MULTIPLE")}
            >
              Множественный выбор
            </button>
          </div>
        </div>

        <div className="cq-time-block">
          <FieldHeader label="Время на ответ" valid={Number(question.timeLimit) > 0} />
          <TimeInput
            value={question.timeLimit}
            onChange={(nextTimeLimit) => setQuestion(questionIndex, { timeLimit: nextTimeLimit })}
          />
        </div>
      </div>

      {questionImage ? (
        <div className="cq-image-shell cq-question-image-shell">
          <img className="cq-question-image" src={questionImage} alt="" />
          <button
            className="cq-image-delete-button"
            type="button"
            aria-label="Удалить фото вопроса"
            onClick={() => setQuestion(questionIndex, { imageUrl: "", imagePreview: "", imageFile: null })}
          >
            <img src={deleteIcon} alt="" />
          </button>
        </div>
      ) : null}

      <div className="cq-answers-block">
        <FieldHeader label="Напишите ответы и выберите верные" valid={answersComplete} />
        <div className={question.options.some((option) => option.imagePreview || option.imageUrl) ? "cq-answer-list has-images" : "cq-answer-list"}>
          {question.options.map((option, optionIndex) => (
            <AnswerRow
              key={option.clientId}
              attachOptionImage={attachOptionImage}
              chooseAnswer={chooseAnswer}
              moveOption={moveOption}
              option={option}
              optionIndex={optionIndex}
              question={question}
              questionIndex={questionIndex}
              deleteOption={deleteOption}
              setFileInputRef={setFileInputRef}
              setOption={setOption}
              triggerFileInput={triggerFileInput}
            />
          ))}
        </div>
      </div>

      <div className="cq-question-actions">
        <button
          className="cq-action-button cq-neutral-button"
          type="button"
          onClick={() =>
            setQuestion(questionIndex, {
              options: [...question.options, createEmptyOption(false)],
            })
          }
        >
          <span>Добавить ответ</span>
          <img src={plusBigIcon} alt="" />
        </button>
        <button
          className="cq-action-button cq-neutral-button"
          type="button"
          onClick={() => deleteQuestion(questionIndex)}
        >
          <span>{complete ? "Удалить вопрос" : "Убрать вопрос"}</span>
          <img src={deleteIcon} alt="" />
        </button>
        {isLastQuestion ? (
          <button
            className="cq-action-button cq-neutral-button cq-add-question-inline"
            type="button"
            onClick={addQuestion}
          >
            <span>Добавить вопрос</span>
            <img src={plusBigIcon} alt="" />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function AnswerRow({
  attachOptionImage,
  chooseAnswer,
  deleteOption,
  moveOption,
  option,
  optionIndex,
  question,
  questionIndex,
  setFileInputRef,
  setOption,
  triggerFileInput,
}) {
  const optionImage = resolveUploadUrl(option.imagePreview || option.imageUrl);
  const selectorIcon =
    question.type === "MULTIPLE"
      ? option.isCorrect
        ? multipleOnIcon
        : multipleIcon
      : option.isCorrect
        ? answerOnIcon
        : answerIcon;

  return (
    <div className={optionImage ? "cq-answer-row has-image has-points-slot" : "cq-answer-row has-points-slot"}>
      <div className="cq-reorder-buttons cq-answer-order">
        <button type="button" disabled={optionIndex === 0} onClick={() => moveOption(questionIndex, optionIndex, -1)}>
          <img src={arrowUpIcon} alt="" />
        </button>
        <button
          type="button"
          disabled={optionIndex === question.options.length - 1}
          onClick={() => moveOption(questionIndex, optionIndex, 1)}
        >
          <img src={arrowDownIcon} alt="" />
        </button>
      </div>

      <div className="cq-answer-field">
        <button
          className="cq-answer-select"
          type="button"
          aria-label="Выбрать верный ответ"
          onClick={() => chooseAnswer(questionIndex, optionIndex)}
        >
          <img src={selectorIcon} alt="" />
        </button>
        <div className="cq-answer-content">
          <AutoResizeTextarea
            className="cq-answer-textarea"
            value={option.text}
            placeholder="Напишите ответ:"
            minHeight={29}
            onChange={(event) => setOption(questionIndex, optionIndex, { text: event.target.value })}
          />
          {optionImage ? (
            <div className="cq-image-shell cq-answer-image-shell">
              <img className="cq-answer-image" src={optionImage} alt="" />
              <button
                className="cq-image-delete-button"
                type="button"
                aria-label="Удалить фото ответа"
                onClick={() => setOption(questionIndex, optionIndex, { imageUrl: "", imagePreview: "", imageFile: null })}
              >
                <img src={deleteIcon} alt="" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <button
        className="cq-icon-button cq-answer-delete-button"
        type="button"
        aria-label="Удалить ответ"
        onClick={() => deleteOption(optionIndex)}
      >
        <img src={deleteIcon} alt="" />
      </button>

      <button
        className="cq-icon-button cq-answer-image-button"
        type="button"
        onClick={() => triggerFileInput(`${question.clientId}:${option.clientId}:image`)}
      >
        <img src={imageAddIcon} alt="" />
      </button>
      <input
        ref={(node) => setFileInputRef(`${question.clientId}:${option.clientId}:image`, node)}
        className="cq-hidden-file"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          attachOptionImage(questionIndex, optionIndex, event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {option.isCorrect ? (
        <div className="cq-points">
          <span>Баллов:</span>
          <strong>100</strong>
        </div>
      ) : (
        <div className="cq-points-spacer" aria-hidden="true" />
      )}
    </div>
  );
}
