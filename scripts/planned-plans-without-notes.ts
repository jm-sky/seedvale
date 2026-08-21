import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(SCRIPT_DIR, '..')
const PLANS_DIR = 'docs/plans'
const PLANS_PATH = resolve(ROOT_DIR, PLANS_DIR)
const NOTES_TOKEN = 'implementation-notes'
const UPDATED_REVIEW_TOKEN = '--updated-review'
const OUTPUT_PATH = resolve(ROOT_DIR, PLANS_DIR, 'PLANNED_PLANS_WITHOUT_NOTES.md')

const output: string[] = []

type PlanDetails = {
  plan: string
  file: string
  path: string
  notes: string
  updatedReviewPath: string | null
}

const main = async () => {
  const allFiles = await readdir(PLANS_PATH)
  const mdFiles = allFiles.filter(file => file.endsWith('.md'))

  const plans = mdFiles.filter(plan => !plan.endsWith(`-${NOTES_TOKEN}.md`) && !plan.endsWith(`${UPDATED_REVIEW_TOKEN}.md`))
  const notes = mdFiles.filter(plan => plan.endsWith(`-${NOTES_TOKEN}.md`))
  const updatedReviews = mdFiles.filter(plan => plan.endsWith(`${UPDATED_REVIEW_TOKEN}.md`))

  const plannedPlans = (
    await Promise.all(
      plans.map(async plan => {
        const content = await readFile(resolve(PLANS_PATH, plan), 'utf8')

        return content.includes('**Status:** `planned` 📋') ? plan : null
      }),
    )
  )
  .filter((plan): plan is string => plan !== null)
  .map(plan => plan.replace('.md', ''))

  const plansWithoutNotes: PlanDetails[] = plannedPlans.filter(plan => {
    const notesFile = `${plan}-${NOTES_TOKEN}.md`
    return !notes.includes(notesFile)
  }).map(plan => ({
    plan,
    file: `${plan}.md`,
    path: `${PLANS_DIR}/${plan}.md`,
    notes: `${plan}-${NOTES_TOKEN}.md`,
    updatedReviewPath: updatedReviews.includes(`${plan}-${UPDATED_REVIEW_TOKEN}.md`) ? `${plan}-${UPDATED_REVIEW_TOKEN}.md` : null,
  }))

  const prompts = plansWithoutNotes.map(({ plan, file, path, notes, updatedReviewPath }) => {
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
      `\`${notes}\``,
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
      '',
      'Plik dodaj na branch `main` w repozytorium.',
      '```',
      '',
    ].join('\n')
  })

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

  console.log(output.join('\n'))

  await writeFile(OUTPUT_PATH, output.join('\n'))
}

main()
