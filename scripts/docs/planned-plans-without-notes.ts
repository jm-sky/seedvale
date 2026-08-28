import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(SCRIPT_DIR, '..')
const PLANS_DIR = 'docs/plans'
const PLANS_PATH = resolve(ROOT_DIR, PLANS_DIR)
const NOTES_DIR = 'implementation-notes'
const NOTES_PATH = resolve(PLANS_PATH, NOTES_DIR)
const REVIEWS_DIR = 'reviews'
const REVIEWS_PATH = resolve(PLANS_PATH, REVIEWS_DIR)
const NOTES_TOKEN = 'implementation-notes'
const UPDATED_REVIEW_TOKEN = '--updated-review'
const OUTPUT_PATH = resolve(ROOT_DIR, PLANS_DIR, 'PLANS-WITHOUT-NOTES.md')

const output: string[] = []

type PlanDetails = {
  plan: string
  file: string
  path: string
  notesPath: string
  updatedReviewPath: string | null
}

const getPlannedPlans = async (plans: string[]): Promise<string[]> => {
  return (
    await Promise.all(
      plans.map(async plan => {
        const content = await readFile(resolve(PLANS_PATH, plan), 'utf8')

        return content.includes('**Status:** `planned` 📋') ? plan : null
      }),
    )
  )
  .filter((plan): plan is string => plan !== null)
  .map(plan => plan.replace('.md', ''))
}

const getPlansWithoutNotes = (plannedPlans: string[], updatedReviews: string[], notes: string[]): PlanDetails[] => {
  return plannedPlans.filter(plan => {
    const notesFile = `${plan}-${NOTES_TOKEN}.md`
    return !notes.includes(notesFile)
  }).map(plan => {
    const updatedReviewFile = `${plan}${UPDATED_REVIEW_TOKEN}.md`

    return {
      plan,
      file: `${plan}.md`,
      path: `${PLANS_DIR}/${plan}.md`,
      notesPath: `${PLANS_DIR}/${NOTES_DIR}/${plan}-${NOTES_TOKEN}.md`,
      updatedReviewPath: updatedReviews.includes(updatedReviewFile) ? `${PLANS_DIR}/${REVIEWS_DIR}/${updatedReviewFile}` : null,
    }
  })
}

const generatePrompt = ({ plan, file, path, updatedReviewPath, notesPath }: PlanDetails): string => {
  return [
    `### \`${plan}.md\``,
    '',
    'Prompt:',
    '',
    '```',
    `Zrób review planu \`${file}\``,
    '',
    'Wczytaj:',
    '- `docs/STATE.md`',
    `- \`${path}\``,
    '- aktualny codebase,',
    '- potrzebne zależności i powiązane implementacje.',
    updatedReviewPath ? `- \`${updatedReviewPath}\`\n` : '',
    'Na podstawie review utwórz w repo plik:',
    `\`${notesPath}\``,
    '',
    'Umieść w nim:',
    '- sugestie dotyczące implementacji,',
    '- istotne detale techniczne,',
    '- decyzje architektoniczne,',
    '- informacje o istniejących systemach i implementacjach, które należy wykorzystać,',
    '- potencjalne problemy, zależności i pułapki,',
    '- inne konkretne wskazówki, które ułatwią agentowi AI poprawną implementację planu.',
    '',
    'Uwzględnij aktualny stan codebase — nie zakładaj, że plan opisuje aktualną implementację.',
    'Bądź oszczędny - pisz to co jest realnie potrzebne, nie pisz rzeczy oczywistych.',
    '',
    'Plik dodaj na branch `main` w repozytorium.',
    '```',
    '',
  ].join('\n')
}

const stripDate = (content: string): string => {
  return content.replace(/^> Date: .+$/m, '')
}

const fillOutput = (plansWithoutNotes: PlanDetails[], prompts: string[]) => {
  output.push('# PLANS PLANNED WITHOUT NOTES')
  output.push('')
  output.push('> Generated with `pnpm plans:without-notes`  ')
  output.push(`> Date: ${new Date().toISOString().split('T').join(' ').replace('Z', '').split('.')[0]}  `)
  output.push('')
  output.push('## PLANS')
  output.push('')
  output.push(plansWithoutNotes.map(({ file }) => `- \`${file}\``).join('\n'))
  output.push('')
  output.push('--------------------------------')
  output.push('## PROMPTS')
  output.push('')
  output.push(prompts.join('\n'))
}

const getExistingContentWithoutDate = async (path: string): Promise<string> => {
  const content = await readFile(path, 'utf8')
  return stripDate(content)
}

const updateFile = async (path: string) => {
  const content = output.join('\n')
  const contentWithoutDate = stripDate(content)
  const existingContentWithoutDate = await getExistingContentWithoutDate(path)

  if (contentWithoutDate === existingContentWithoutDate) {
    console.log(`${path} already up to date`)
    return
  }

  await writeFile(path, content)
}

const main = async () => {
  const allFiles: string[] = await readdir(PLANS_PATH)
  const mdFiles: string[] = allFiles.filter(file => file.endsWith('.md'))

  // Defensive: notes/reviews normally live in NOTES_PATH/REVIEWS_PATH, not PLANS_PATH itself.
  const plans: string[] = mdFiles.filter(plan => !plan.endsWith(`-${NOTES_TOKEN}.md`) && !plan.endsWith(`${UPDATED_REVIEW_TOKEN}.md`))
  const notes: string[] = await readdir(NOTES_PATH)
  const updatedReviews: string[] = await readdir(REVIEWS_PATH)
  const plannedPlans: string[] = await getPlannedPlans(plans)
  const plansWithoutNotes: PlanDetails[] = getPlansWithoutNotes(plannedPlans, updatedReviews, notes)

  const prompts = plansWithoutNotes.map(planDetails => generatePrompt(planDetails))

  fillOutput(plansWithoutNotes, prompts)

  await updateFile(OUTPUT_PATH)
}

main()
