import { SignUp } from '@clerk/nextjs'

export const metadata = { title: 'List your institute' }

export default function SignUpPage() {
  return (
    <div className="flex justify-center">
      <SignUp />
    </div>
  )
}
