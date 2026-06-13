import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

mongoose.connect('mongodb://127.0.0.1:27017/animal-rescue-db').then(async () => {
  console.log('Connected to MongoDB\n');
  
  const testUsers = [
    {
      firstName: 'Test',
      lastName: 'Adopter',
      email: 'adopter@test.com',
      password: await bcrypt.hash('password123', 10),
      role: 'ADOPTER',
      isUserActive: true
    },
    {
      firstName: 'Test',
      lastName: 'Volunteer',
      email: 'volunteer@test.com',
      password: await bcrypt.hash('password123', 10),
      role: 'VOLUNTEER',
      isUserActive: true
    }
  ];
  
  for (const user of testUsers) {
    const existing = await mongoose.connection.db.collection('users').findOne({ email: user.email });
    if (existing) {
      console.log(`⚠️  User ${user.email} already exists, skipping`);
    } else {
      await mongoose.connection.db.collection('users').insertOne(user);
      console.log(`✅ Created user: ${user.email} (Password: password123)`);
    }
  }
  
  console.log('\n✅ Test users ready!');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});