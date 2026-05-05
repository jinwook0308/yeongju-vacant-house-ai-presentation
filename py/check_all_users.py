from db import SessionLocal, User, SocialAccount

session = SessionLocal()

try:
    users = session.query(User).order_by(User.id.asc()).all()

    print("=== 남아 있는 users ===")
    if not users:
        print("없음")
    else:
        for user in users:
            print(
                f"id={user.id}, email={user.email}, name={user.name}, role={user.role}, status={user.status}"
            )

    print("\n=== 남아 있는 social_accounts ===")
    socials = session.query(SocialAccount).order_by(SocialAccount.id.asc()).all()

    if not socials:
        print("없음")
    else:
        for social in socials:
            print(
                f"id={social.id}, user_id={social.user_id}, provider={social.provider}, "
                f"provider_user_id={social.provider_user_id}, provider_email={social.provider_email}"
            )
finally:
    session