import mongoose from 'mongoose';

mongoose.connect('mongodb://127.0.0.1:27017/animal-rescue-db').then(async () => {
  console.log('Connected to MongoDB\n');
  
  const animalId = '6a23d425783af659027d2b37';
  const animal = await mongoose.connection.db.collection('animals').findOne({ 
    _id: new mongoose.Types.ObjectId(animalId) 
  });
  
  if (animal) {
    console.log('✅ Animal EXISTS:', animal.name, '- Status:', animal.status);
  } else {
    console.log('❌ Animal DOES NOT EXIST with ID:', animalId);
    console.log('\nHere are the first 5 animals in your database:');
    const allAnimals = await mongoose.connection.db.collection('animals').find({}).limit(5).toArray();
    allAnimals.forEach(a => {
      console.log(`  - ID: ${a._id}`);
      console.log(`    Name: ${a.name || 'Unnamed'}, Status: ${a.status}\n`);
    });
  }
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});