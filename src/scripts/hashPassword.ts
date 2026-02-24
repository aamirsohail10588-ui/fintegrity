import bcrypt from "bcrypt";

async function run() {
  const password = "Admin@123"; // change later
  const hash = await bcrypt.hash(password, 10);
  console.log("HASH:", hash);
}

run();
