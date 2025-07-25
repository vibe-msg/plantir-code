import { z } from "zod"

import { MessageV2 } from "../session/message-v2"
import { Bus } from "../bus"
import fs from "node:fs/promises"
import path from "node:path"

export const PlantirEvent = {
  PreSendMessage: Bus.event(
    "session.pre_send_message",
    z.object({
      sessionID: z.string(),
      text: z.string(),
      attachments: z.array(z.any()).optional(),
    }),
  ),
  HookCompleted: Bus.event(
    "session.hook_completed",
    z.object({
      sessionID: z.string(),
      hookType: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    }),
  ),
}

const PLANTIR_DIR = path.join(process.cwd(), ".plantir")
const PRD_PATH = path.join(PLANTIR_DIR, "prd.md")
const REQUIREMENTS_PATH = path.join(PLANTIR_DIR, "requirements.md")
const TASKS_DIR = path.join(PLANTIR_DIR, "tasks")
const TODO_PATH = path.join(TASKS_DIR, "todo.md")
const LANGUAGE = 'Korean'

export const plantirModeMessage = async ({ input }: {
  input: {
    sessionID: string
    messageID: string
    providerID: string
    modelID: string
    mode?: string
    parts: (MessageV2.TextPart | MessageV2.FilePart)[]
  }
}) => {
  const modifiedInput = structuredClone(input)
  const textPart = modifiedInput.parts.find((p) => p.type === "text")

  if (!textPart || !textPart.text || input.mode !== 'plantir') return

  // 1. .plantir/prd.md 파일 확인
  try {
    await fs.access(PRD_PATH)
  } catch (error) {
    return Promise.reject(new Error(`'.plantir/prd.md'에 요구사항을 작성 후 다시 요청해주세요.`));
  }

  // 2. .plantir/requirements.md 파일 확인
  try {
    await fs.access(REQUIREMENTS_PATH)
  } catch (error) {
    // 파일이 없으면 AI에게 생성 요청
    textPart.text = `You are an AI assistant. Your task is to generate a requirements document based on the PRD.
Please read the content of "${PRD_PATH}".
Then, create a new file at "${REQUIREMENTS_PATH}" using the EARS (Easy Approach to Requirements Syntax).

Here is a template to follow. Modify it to fit the contents of "${PRD_PATH}".

<!-- Template Start -->

# Requirements Document

## Introduction

This is a quote management app developed with Flutter. It allows users to add, modify, and delete quotes, and provides regular notifications. Users can browse the list of quotes and swipe to see other quotes on the individual quote page.

## Requirements

### Requirement 1

**User Story:** As a user, I want to be able to add a new quote so that I can collect personally meaningful quotes.

#### Acceptance Criteria

1. WHEN the user presses the add quote button, THEN the system must display the quote input screen.
2. WHEN the user enters the quote text and author and presses the save button, THEN the system must save the new quote to the database.
3. IF the quote text is empty, THEN the system must display an error message and refuse to save.
4. WHEN the quote is successfully saved, THEN the system must return to the quote list screen.

<!-- Template End -->

After creating the file, terminate the session.
Please reply in ${LANGUAGE}.`
    return modifiedInput
  }

  // 3. .plantir/tasks/todo.md 파일 확인
  try {
    await fs.access(TODO_PATH)
  } catch (error) {
    // 파일이 없으면 tasks 디렉토리 생성 후 AI에게 파일 생성 요청
    await fs.mkdir(TASKS_DIR, { recursive: true })
    textPart.text = `You are an AI assistant. Your task is to break down the requirements into a list of tasks.
1. Read the requirements from "${REQUIREMENTS_PATH}".
2. Decompose the requirements into a series of actionable tasks.
3. Create and populate "${TODO_PATH}" with a checklist of these tasks. Use the following format for each item:
   \'- [ ] {{sequence}}-{{task-filename}}.md {{task-description}}
       _Requirements: {{dependency-sequence}}, {{dependency-sequence}}'
4. For EACH task in the checklist, create a corresponding markdown file in "${TASKS_DIR}/" (e.g., "${TASKS_DIR}/1-initial-setup.md").
5. In each of these newly created task files, write a detailed execution plan for that specific task. Do not summarize; be specific and thorough. It is critical to create all task files, not just one.
6. After creating all the necessary files, terminate the session.
Please reply in ${LANGUAGE}.`
    return modifiedInput
  }

  // 4. .plantir/tasks/todo.md 파일 내용 확인 및 다음 작업 지시
  const todoContent = await fs.readFile(TODO_PATH, "utf-8")
  const tasks = todoContent.match(/^- \[([ x])\] .*/gm) || []

  const unfinishedTask = tasks.find(task => task.startsWith('- [ ]'))

  if (!unfinishedTask) {
    textPart.text = "모든 작업이 완료되었습니다.";
    return modifiedInput
  }

  const taskFileNameMatch = unfinishedTask.match(/- \[ \] ([\S]+\.md)/)
  if (!taskFileNameMatch) {
    return Promise.reject(new Error(`'${TODO_PATH}' 파일에서 올바른 형식의 다음 작업을 찾을 수 없습니다. 형식을 확인해주세요: '- [ ] {순번}-{파일명}.md {작업내용}'`));
  }
  const taskFileName = taskFileNameMatch[1]
  const taskFilePath = path.join(TASKS_DIR, taskFileName)

  textPart.text = `You are an AI assistant continuing a multi-step task.
Your current task is defined in "${taskFilePath}".
Please read the instructions in that file carefully.

1.  First, write the necessary test code related to this task.
2.  Then, implement the code to complete the task as described.
3.  Once the task is complete, update the checklist in "${TODO_PATH}" by changing '- [ ]' to '- [x]' for the task you just finished.
4.  If there is a next task, write detailed instructions for the next AI agent in its corresponding .md file to provide context for the next step.
5.  Finally, terminate the session. A new agent will pick up the next task.
Please reply in ${LANGUAGE}.`
  return modifiedInput
}

export const preSendMessageHook = async ({ input }: {
  input: {
    sessionID: string
    providerID: string
    modelID: string
    mode?: string
    parts: (MessageV2.TextPart | MessageV2.FilePart)[]
  }
}) => {
  const textPart = input.parts.find((p) => p.type === "text")

  if (!textPart) return;

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsub()
      reject(new Error("pre_send_message hook timeout"))
    }, 3000)

    const unsub = Bus.subscribe(PlantirEvent.HookCompleted, (evt) => {
      if (evt.properties.sessionID === input.sessionID && evt.properties.hookType === "pre_send_message") {
        clearTimeout(timeout)
        unsub()
        if (evt.properties.success) {
          resolve()
        } else {
          reject(new Error(evt.properties.error || "Hook failed"))
        }
      }
    })

    Bus.publish(PlantirEvent.PreSendMessage, {
      sessionID: input.sessionID,
      text: textPart.text,
      attachments: input.parts.filter((p) => p.type === "file"),
    })
  })
}
